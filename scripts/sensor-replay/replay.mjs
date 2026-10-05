import {
  bucketizeSamples,
  summarizeBuckets,
} from "../../packages/shared/src/scoring.ts";

// Offline adapters and a reference transport model. This does not execute Monkey C.
export function rmssd(intervals) {
  if (
    !Array.isArray(intervals) ||
    intervals.length < 2 ||
    intervals.some((value) => !Number.isFinite(value) || value <= 0)
  )
    return null;
  let sum = 0;
  for (let i = 1; i < intervals.length; i++)
    sum += (intervals[i] - intervals[i - 1]) ** 2;
  const result = Math.sqrt(sum / (intervals.length - 1));
  return Number.isFinite(result) ? result : null;
}

export function parseEmpaticaHr(text) {
  const lines = text.split(/\r?\n/);
  // A final newline terminates the last record; preceding blank records are
  // missing measurements and must retain their positions on the source clock.
  if (lines.at(-1) === "") lines.pop();
  if (lines.length < 3)
    throw new Error("HR CSV needs start time, rate and readings");
  const rawStart = lines[0].split(",")[0].trim();
  const startMs = /^\d+(\.\d+)?$/.test(rawStart)
    ? Number(rawStart) * 1000
    : Date.parse(
        /[zZ]|[+-]\d\d:?\d\d$/.test(rawStart)
          ? rawStart
          : `${rawStart.replace(" ", "T")}Z`,
      );
  const rateHz = Number(lines[1]);
  if (!Number.isFinite(startMs) || !Number.isFinite(rateHz) || rateHz <= 0) {
    throw new Error("Invalid HR CSV time or sampling rate");
  }
  const events = lines.slice(2).map((raw, index) => {
    if (raw.includes(",")) throw new Error("Expected one HR value per row");
    const value = raw.trim() === "" ? null : Number(raw);
    return {
      elapsedMs: Math.round((index * 1000) / rateHz),
      heartRateBpm: value,
      origin: "source-derived-hr",
    };
  });
  return { startMs, rateHz, events };
}

export function sampleSensorEvents(
  events,
  {
    durationMs,
    periodMs = 5000,
    staleAfterMs = 5000,
    epochMs = Date.parse("2026-01-01T00:00:00.000Z"),
  } = {},
) {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 0 ||
    !Number.isSafeInteger(periodMs) ||
    periodMs <= 0 ||
    !Number.isFinite(staleAfterMs) ||
    staleAfterMs < 0 ||
    !Number.isSafeInteger(epochMs) ||
    epochMs < 0 ||
    !Number.isSafeInteger(epochMs + durationMs) ||
    epochMs + durationMs > 8_640_000_000_000_000
  ) {
    throw new Error("Invalid replay clock");
  }
  for (let i = 0; i < events.length; i++) {
    if (
      !Number.isInteger(events[i].elapsedMs) ||
      events[i].elapsedMs < 0 ||
      (i > 0 && events[i].elapsedMs <= events[i - 1].elapsedMs)
    ) {
      throw new Error(
        "Sensor events must have strictly increasing nonnegative millisecond offsets",
      );
    }
  }
  const frames = [];
  let cursor = -1;
  for (
    let elapsedMs = periodMs;
    elapsedMs <= durationMs;
    elapsedMs += periodMs
  ) {
    while (
      cursor + 1 < events.length &&
      events[cursor + 1].elapsedMs <= elapsedMs
    )
      cursor++;
    const event = events[cursor];
    const fresh = event && elapsedMs - event.elapsedMs <= staleAfterMs;
    const validHr =
      fresh &&
      Number.isFinite(event.heartRateBpm) &&
      event.heartRateBpm > 0 &&
      Number.isSafeInteger(Math.round(event.heartRateBpm));
    const rr = fresh ? (event.heartBeatIntervalsMs ?? []) : [];
    const derivedRmssd = rmssd(rr);
    frames.push({
      sample: {
        timestamp: epochMs + elapsedMs,
        elapsedMs,
        heartRateBpm: validHr ? Math.round(event.heartRateBpm) : null,
        // Study condition labels and EDA are never substituted for Garmin stress.
        stressLevel: null,
        hrvRmssd: derivedRmssd,
        heartBeatIntervalsMs: derivedRmssd === null ? [] : [...rr],
      },
      annotation: {
        quality: !fresh
          ? "missing-or-stale"
          : validHr
            ? "available"
            : "invalid-hr",
        sourceState: fresh ? (event.sourceState ?? null) : null,
        injection: fresh ? (event.injection ?? null) : null,
        heartRateOrigin: fresh ? (event.origin ?? "synthetic") : "missing",
        hrvOrigin: derivedRmssd === null ? "unavailable" : "derived-rmssd",
        filmIntensityLabel: null,
      },
    });
  }
  return frames;
}

export function scoreReplay(frames) {
  const buckets = bucketizeSamples(frames.map((frame) => frame.sample));
  const missingSignalTimes = frames
    .filter(
      ({ sample }) =>
        sample.heartRateBpm === null &&
        sample.stressLevel === null &&
        sample.hrvRmssd === null,
    )
    .map(({ sample }) => sample.elapsedMs);
  return {
    scoreKind: "existing-app-heuristic-not-ground-truth",
    buckets,
    summary: summarizeBuckets(buckets),
    missingSignalTimes,
    warnings: missingSignalTimes.length
      ? [
          "Insufficient-data intervals have no intensity score; gaps are not observed calm",
        ]
      : [],
  };
}

export class MemoryStorage {
  value = null;
  failNext = false;
  save(snapshot) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Injected storage failure");
    }
    this.value = structuredClone(snapshot);
  }
}

// Executable specification of the proposed queue contract, not the watch runtime.
export class CaptureModel {
  constructor(storage = new MemoryStorage()) {
    this.storage = storage;
    this.state = structuredClone(
      storage.value ?? {
        version: 1,
        queue: [],
        acknowledged: 0,
        stopped: false,
      },
    );
    this.phase = storage.value ? "recovered" : "recording";
    this.pending = null;
  }
  commit(next) {
    this.storage.save(next);
    this.state = next;
  }
  capture(sample) {
    if (this.phase !== "recording") return false;
    try {
      this.commit({
        ...this.state,
        queue: [...this.state.queue, structuredClone(sample)],
      });
    } catch (error) {
      this.phase = "storage-error";
      throw error;
    }
    return true;
  }
  stop() {
    // User intent stops new capture even if the subsequent checkpoint fails.
    this.phase = "stopped";
    this.commit({ ...this.state, stopped: true });
  }
  request(maxBatch = 30) {
    if (!Number.isInteger(maxBatch) || maxBatch <= 0)
      throw new Error("Invalid batch size");
    if (this.pending || !this.state.queue.length) return null;
    this.pending = structuredClone(this.state.queue.slice(0, maxBatch));
    return structuredClone(this.pending);
  }
  failRequest() {
    this.pending = null;
  }
  acknowledge(count) {
    if (
      !this.pending ||
      !Number.isInteger(count) ||
      count <= 0 ||
      count > this.pending.length
    ) {
      this.pending = null;
      return false;
    }
    this.commit({
      ...this.state,
      queue: this.state.queue.slice(count),
      acknowledged: this.state.acknowledged + count,
    });
    this.pending = null;
    return true;
  }
  canComplete() {
    return this.state.stopped && !this.pending && this.state.queue.length === 0;
  }
}
