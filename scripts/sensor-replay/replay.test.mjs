import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { newSamplesForBatch } from "../../apps/web/lib/session-upload.ts";
import {
  CaptureModel,
  MemoryStorage,
  parseEmpaticaHr,
  rmssd,
  sampleSensorEvents,
  scoreReplay,
} from "./replay.mjs";
import { syntheticScreening } from "./synthetic.mjs";

const fixture = syntheticScreening();
const frames = sampleSensorEvents(fixture.events, {
  durationMs: fixture.durationMs,
});
const samples = frames.map(({ sample }) => sample);

test("synthetic replay is deterministic, preserves clock and does not invent gap readings", () => {
  assert.deepEqual(
    frames,
    sampleSensorEvents(syntheticScreening().events, { durationMs: 60000 }),
  );
  assert.equal(frames.length, 12);
  assert.deepEqual(
    samples.map((s) => s.elapsedMs),
    Array.from({ length: 12 }, (_, i) => (i + 1) * 5000),
  );
  assert.equal(frames[4].annotation.quality, "missing-or-stale");
  assert.equal(samples[4].heartRateBpm, null);
  assert.equal(samples[5].heartRateBpm, null);
  assert.equal(frames[8].annotation.quality, "invalid-hr");
  assert.equal(samples[8].heartRateBpm, null);
});

test("invalid measurements and source labels never become Garmin stress or film labels", () => {
  assert.ok(samples.every((sample) => sample.stressLevel === null));
  assert.ok(
    frames.every((frame) => frame.annotation.filmIntensityLabel === null),
  );
  assert.equal(frames[7].annotation.sourceState, "synthetic-elevated-period");
});

test("RMSSD conversion is explicit, deterministic and rejects insufficient or invalid intervals", () => {
  assert.equal(rmssd([800, 830, 800]), 30);
  assert.equal(rmssd([800]), null);
  assert.equal(rmssd([800, -1]), null);
  assert.equal(rmssd([800, NaN]), null);
  assert.equal(rmssd([Number.MAX_VALUE, 1]), null);
});

test("real shared scoring stays finite and bounded for gap/noise fixtures", () => {
  const scored = scoreReplay(frames);
  assert.equal(scored.scoreKind, "existing-app-heuristic-not-ground-truth");
  assert.equal(scored.buckets.length, 12);
  assert.ok(
    scored.buckets.every(
      (b) =>
        b.intensityScore === null ||
        (Number.isFinite(b.intensityScore) &&
          b.intensityScore >= 0 &&
          b.intensityScore <= 100),
    ),
  );
  assert.deepEqual(scored.missingSignalTimes, [25000, 30000]);
  assert.equal(scored.warnings.length, 1);
  // Missing/stale signals must never turn into a numeric calm score.
  assert.equal(
    scored.buckets.find((b) => b.bucketStartMs === 25000).intensityScore,
    null,
  );
});

test("out-of-order input is rejected rather than silently relabeled or reordered", () => {
  assert.throws(() =>
    sampleSensorEvents([{ elapsedMs: 1000 }, { elapsedMs: 0 }], {
      durationMs: 5000,
    }),
  );
  assert.throws(() =>
    sampleSensorEvents([{ elapsedMs: 0 }, { elapsedMs: 0 }], {
      durationMs: 5000,
    }),
  );
});

test("invalid epochs and corrupt numeric HR cannot produce invalid wire timestamps or readings", () => {
  for (const epochMs of [NaN, Infinity, -1, "1000", 8_640_000_000_000_000]) {
    assert.throws(
      () => sampleSensorEvents([], { durationMs: 5000, epochMs }),
      /Invalid replay clock/,
    );
  }
  const replay = sampleSensorEvents(
    [{ elapsedMs: 0, heartRateBpm: Number.MAX_VALUE }],
    { durationMs: 5000 },
  );
  assert.equal(replay[0].sample.heartRateBpm, null);
});

test("empty input and freshness boundaries never leak future readings", () => {
  assert.equal(
    sampleSensorEvents([], { durationMs: 5000 })[0].sample.heartRateBpm,
    null,
  );
  const replay = sampleSensorEvents(
    [
      { elapsedMs: 0, heartRateBpm: 70 },
      { elapsedMs: 11000, heartRateBpm: 100 },
    ],
    { durationMs: 15000 },
  );
  assert.deepEqual(
    replay.map((frame) => frame.sample.heartRateBpm),
    [70, null, 100],
  );
});

test("a 25-second pending upload does not block sampling or Stop in the reference model", () => {
  const model = new CaptureModel();
  samples.slice(0, 3).forEach((sample) => model.capture(sample));
  const pending = model.request(3);
  samples.slice(3, 8).forEach((sample) => model.capture(sample));
  assert.equal(model.state.queue.length, 8);
  assert.equal(
    model.state.queue.at(-1).elapsedMs - pending.at(-1).elapsedMs,
    25000,
  );
  model.stop();
  assert.equal(model.capture(samples[8]), false);
  assert.equal(model.canComplete(), false);
  model.acknowledge(3);
  assert.deepEqual(model.state.queue, samples.slice(3, 8));
  model.request();
  model.acknowledge(5);
  assert.equal(model.canComplete(), true);
});

test("lost acknowledgment replay uses the real backend deduplicator", () => {
  const model = new CaptureModel();
  samples.slice(0, 3).forEach((sample) => model.capture(sample));
  const first = model.request();
  const stored = newSamplesForBatch([], first, false);
  model.failRequest();
  model.capture(samples[3]);
  const retry = model.request();
  stored.push(...newSamplesForBatch(stored, retry, false));
  model.acknowledge(retry.length);
  assert.deepEqual(stored, samples.slice(0, 4));
  assert.equal(model.state.acknowledged, 4);
});

test("restart retains pending prefix and newly captured tail without silently resuming", () => {
  const storage = new MemoryStorage();
  const model = new CaptureModel(storage);
  model.capture(samples[0]);
  model.request();
  model.capture(samples[1]);
  const restored = new CaptureModel(storage);
  assert.deepEqual(restored.state.queue, samples.slice(0, 2));
  assert.equal(restored.phase, "recovered");
  assert.equal(restored.capture(samples[2]), false);
  restored.stop();
  restored.request();
  restored.acknowledge(2);
  assert.equal(restored.canComplete(), true);
});

test("storage failure does not remove pending rows or inflate acknowledged count", () => {
  const storage = new MemoryStorage();
  const model = new CaptureModel(storage);
  model.capture(samples[0]);
  model.request();
  storage.failNext = true;
  assert.throws(() => model.acknowledge(1), /storage failure/);
  assert.deepEqual(new CaptureModel(storage).state.queue, [samples[0]]);
  assert.equal(model.state.acknowledged, 0);
  model.acknowledge(1);
  assert.equal(new CaptureModel(storage).state.acknowledged, 1);
});

test("failed capture and Stop persistence retain saved data and halt capture", () => {
  const storage = new MemoryStorage();
  const model = new CaptureModel(storage);
  model.capture(samples[0]);
  storage.failNext = true;
  assert.throws(() => model.capture(samples[1]), /storage failure/);
  assert.deepEqual(model.state.queue, [samples[0]]);
  assert.equal(model.phase, "storage-error");
  assert.equal(model.capture(samples[1]), false);
  storage.failNext = true;
  assert.throws(() => model.stop(), /storage failure/);
  assert.equal(model.phase, "stopped");
  assert.equal(model.state.stopped, false);
  assert.equal(model.capture(samples[1]), false);
});

test("partial acknowledgments preserve the tail; invalid counts consume nothing", () => {
  for (const count of [0, -1, 1.5, 4, null]) {
    const model = new CaptureModel();
    samples.slice(0, 3).forEach((s) => model.capture(s));
    model.request();
    assert.equal(model.acknowledge(count), false);
    assert.deepEqual(model.state.queue, samples.slice(0, 3));
  }
  const model = new CaptureModel();
  samples.slice(0, 3).forEach((s) => model.capture(s));
  model.request();
  model.acknowledge(1);
  assert.deepEqual(model.state.queue, samples.slice(1, 3));
});

test("Empatica adapter reads timestamps/rates, preserves values and handles malformed headers", () => {
  const parsed = parseEmpaticaHr("2020-01-01 00:00:00\n1\n72.2\n73.6\n");
  assert.equal(parsed.startMs, Date.parse("2020-01-01T00:00:00Z"));
  assert.equal(parsed.events[1].elapsedMs, 1000);
  assert.equal(parsed.events[1].heartRateBpm, 73.6);
  assert.throws(() => parseEmpaticaHr("invalid\n1\n72"));
  assert.throws(() => parseEmpaticaHr("1577836800\n0\n72"));
});

test("trailing missing source rows retain their clock positions", () => {
  const parsed = parseEmpaticaHr("1577836800\n1\n72\n\n\n");
  assert.deepEqual(
    parsed.events.map((e) => [e.elapsedMs, e.heartRateBpm]),
    [
      [0, 72],
      [1000, null],
      [2000, null],
    ],
  );
});

test("licensed real HR excerpt feeds shared scoring without adding affect labels", () => {
  const text = readFileSync(
    new URL(
      "../../fixtures/sensor-replay/physionet-S01-HR-excerpt.csv",
      import.meta.url,
    ),
    "utf8",
  );
  const parsed = parseEmpaticaHr(text);
  const replay = sampleSensorEvents(parsed.events, {
    durationMs: 60000,
    epochMs: parsed.startMs,
  });
  assert.equal(replay.length, 12);
  assert.deepEqual(
    [
      replay[0].sample.heartRateBpm,
      replay[1].sample.heartRateBpm,
      replay.at(-1).sample.heartRateBpm,
    ],
    [90, 86, 90],
  );
  assert.ok(
    replay.every(
      (r) =>
        r.sample.heartRateBpm > 0 &&
        r.sample.stressLevel === null &&
        r.sample.hrvRmssd === null,
    ),
  );
  assert.ok(
    replay.every(
      (r) =>
        r.annotation.sourceState === null &&
        r.annotation.filmIntensityLabel === null,
    ),
  );
  assert.ok(Number.isFinite(scoreReplay(replay).summary.peakIntensity));
});

test("real fixture byte hash and reading count match its provenance", () => {
  const bytes = readFileSync(
    new URL(
      "../../fixtures/sensor-replay/physionet-S01-HR-excerpt.csv",
      import.meta.url,
    ),
  );
  const provenance = JSON.parse(
    readFileSync(
      new URL("../../fixtures/sensor-replay/provenance.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    provenance.excerptSha256,
  );
  assert.equal(
    parseEmpaticaHr(bytes.toString("utf8")).events.length,
    provenance.excerptReadings,
  );
});
