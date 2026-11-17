import type { BiometricSample } from "@film-intensity/shared";

export class SessionUploadConflict extends Error {}

function sampleKey(sample: BiometricSample): string {
  const timestamp =
    typeof sample.timestamp === "number"
      ? sample.timestamp
      : Date.parse(sample.timestamp);
  return `${timestamp}:${sample.elapsedMs}`;
}

function sameReading(left: BiometricSample, right: BiometricSample): boolean {
  const leftIntervals = left.heartBeatIntervalsMs ?? [];
  const rightIntervals = right.heartBeatIntervalsMs ?? [];
  return (
    left.heartRateBpm === right.heartRateBpm &&
    left.stressLevel === right.stressLevel &&
    left.hrvRmssd === right.hrvRmssd &&
    leftIntervals.length === rightIntervals.length &&
    leftIntervals.every((value, index) => value === rightIntervals[index])
  );
}

/** Validate the whole request before changing the store, including intra-batch replays. */
export function newSamplesForBatch(
  existing: BiometricSample[],
  incoming: BiometricSample[],
  completed: boolean,
): BiometricSample[] {
  const known = new Map(existing.map((sample) => [sampleKey(sample), sample]));
  const additions: BiometricSample[] = [];

  for (const sample of incoming) {
    const key = sampleKey(sample);
    const previous = known.get(key);
    if (previous) {
      if (!sameReading(previous, sample)) {
        throw new SessionUploadConflict(
          "Sample conflicts with an already received reading.",
        );
      }
      continue;
    }

    if (completed) {
      throw new SessionUploadConflict(
        "A completed session cannot accept new samples.",
      );
    }

    known.set(key, sample);
    additions.push(sample);
  }

  return additions;
}
