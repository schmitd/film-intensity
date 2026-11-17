// Uses the real TypeScript implementation and Node's type stripping, no packages.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  newSamplesForBatch,
  SessionUploadConflict,
} from "../apps/web/lib/session-upload.ts";

const epoch = Date.parse("2026-06-29T00:00:00.000Z");
function sample(offset = 0, extra = {}) {
  return {
    timestamp: epoch + offset,
    elapsedMs: offset,
    heartRateBpm: 80,
    stressLevel: null,
    hrvRmssd: null,
    heartBeatIntervalsMs: [],
    ...extra,
  };
}

test("new batch keeps original order", () => {
  const batch = [sample(5000), sample(0)];
  assert.deepEqual(newSamplesForBatch([], batch, false), batch);
});

test("exact, reordered, and partial replays insert only new readings", () => {
  const existing = [sample(0), sample(5000)];
  assert.deepEqual(newSamplesForBatch(existing, existing, false), []);
  assert.deepEqual(
    newSamplesForBatch(existing, [...existing].reverse(), false),
    [],
  );
  assert.deepEqual(
    newSamplesForBatch(existing, [sample(5000), sample(10000)], false),
    [sample(10000)],
  );
});

test("duplicates inside a request are stored once", () => {
  assert.deepEqual(newSamplesForBatch([], [sample(), sample()], false), [
    sample(),
  ]);
});

test("ISO and epoch representations of the same instant are equivalent", () => {
  assert.deepEqual(
    newSamplesForBatch(
      [sample()],
      [sample(0, { timestamp: new Date(epoch).toISOString() })],
      false,
    ),
    [],
  );
});

test("missing historical intervals and an empty array are equivalent", () => {
  const legacy = sample();
  delete legacy.heartBeatIntervalsMs;
  assert.deepEqual(newSamplesForBatch([legacy], [sample()], false), []);
});

for (const [field, value] of Object.entries({
  heartRateBpm: 120,
  stressLevel: 30,
  hrvRmssd: 40,
  heartBeatIntervalsMs: [800, 850],
})) {
  test(`conflicting ${field} rejects the entire batch without mutation`, () => {
    const existing = [sample()];
    const incoming = [sample(5000), sample(0, { [field]: value })];
    const before = structuredClone({ existing, incoming });
    assert.throws(
      () => newSamplesForBatch(existing, incoming, false),
      SessionUploadConflict,
    );
    assert.deepEqual({ existing, incoming }, before);
  });
}

test("ordered heartbeat intervals are part of a reading", () => {
  assert.throws(
    () =>
      newSamplesForBatch(
        [sample(0, { heartBeatIntervalsMs: [800, 850] })],
        [sample(0, { heartBeatIntervalsMs: [850, 800] })],
        false,
      ),
    SessionUploadConflict,
  );
});

test("conflicts inside the same batch reject without mutation", () => {
  const incoming = [sample(), sample(0, { heartRateBpm: 90 })];
  const before = structuredClone(incoming);
  assert.throws(
    () => newSamplesForBatch([], incoming, false),
    SessionUploadConflict,
  );
  assert.deepEqual(incoming, before);
});

test("same metrics with differing timestamp or elapsed time remain distinct", () => {
  const incoming = [
    sample(0, { timestamp: epoch + 1 }),
    sample(0, { elapsedMs: 1 }),
  ];
  assert.deepEqual(newSamplesForBatch([sample()], incoming, false), incoming);
});

test("completed session permits only duplicate-only uploads", () => {
  const existing = [sample()];
  assert.deepEqual(newSamplesForBatch(existing, [sample()], true), []);
  assert.throws(
    () => newSamplesForBatch(existing, [sample(), sample(5000)], true),
    SessionUploadConflict,
  );
  assert.throws(
    () => newSamplesForBatch(existing, [sample(0, { heartRateBpm: 90 })], true),
    SessionUploadConflict,
  );
  assert.deepEqual(existing, [sample()]);
});
