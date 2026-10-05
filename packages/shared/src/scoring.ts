import type {
  BiometricSample,
  FilmIntensityBucket,
  FilmIntensitySummary,
  IntenseMoment,
} from "./contracts";

export const DEFAULT_BUCKET_MS = 5_000;

type NullableNumber = number | null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasUsableSignal(sample: BiometricSample): boolean {
  return [sample.heartRateBpm, sample.stressLevel, sample.hrvRmssd].some(
    isFiniteNumber,
  );
}

export function hasIntensityScore(
  bucket: FilmIntensityBucket,
): bucket is FilmIntensityBucket & { intensityScore: number } {
  return (
    bucket.dataStatus !== "insufficient-data" &&
    isFiniteNumber(bucket.intensityScore)
  );
}

function average(values: Array<NullableNumber>): NullableNumber {
  const numericValues = values.filter(isFiniteNumber);
  if (!numericValues.length) {
    return null;
  }

  return numericValues.reduce(
    (sum, value) => sum + value / numericValues.length,
    0,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeBaseline(samples: BiometricSample[]) {
  const heartRate = average(samples.map((sample) => sample.heartRateBpm));
  const stress = average(samples.map((sample) => sample.stressLevel));
  const hrv = average(samples.map((sample) => sample.hrvRmssd));

  return {
    heartRate: heartRate ?? 70,
    stress: stress ?? 20,
    hrv: hrv ?? 42,
  };
}

export function computeSampleIntensity(
  sample: BiometricSample,
  baseline = computeBaseline([sample]),
): number | null {
  if (!hasUsableSignal(sample)) return null;
  const heartRateDelta = !isFiniteNumber(sample.heartRateBpm)
    ? 0
    : (sample.heartRateBpm - baseline.heartRate) / 30;
  const stressDelta = !isFiniteNumber(sample.stressLevel)
    ? 0
    : (sample.stressLevel - baseline.stress) / 50;
  const hrvSuppression = !isFiniteNumber(sample.hrvRmssd)
    ? 0
    : (baseline.hrv - sample.hrvRmssd) / Math.max(baseline.hrv, 10);

  const weighted =
    heartRateDelta * 0.5 + stressDelta * 0.35 + hrvSuppression * 0.3;
  return clamp(Math.round((weighted + 0.4) * 100), 0, 100);
}

export function classifyIntensity(score: number | null) {
  if (!isFiniteNumber(score)) return null;
  if (score >= 85) {
    return "overdrive" as const;
  }

  if (score >= 67) {
    return "spike" as const;
  }

  if (score >= 42) {
    return "rising" as const;
  }

  return "calm" as const;
}

export function bucketizeSamples(
  samples: BiometricSample[],
  bucketMs = DEFAULT_BUCKET_MS,
): FilmIntensityBucket[] {
  if (!samples.length) {
    return [];
  }

  const baseline = computeBaseline(samples);
  const buckets = new Map<number, BiometricSample[]>();

  for (const sample of samples) {
    const bucketStartMs = Math.floor(sample.elapsedMs / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStartMs) ?? [];
    bucket.push(sample);
    buckets.set(bucketStartMs, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([bucketStartMs, bucketSamples]) => {
      const scores = bucketSamples
        .map((sample) => computeSampleIntensity(sample, baseline))
        .filter(isFiniteNumber);
      return {
        bucketStartMs,
        sampleCount: bucketSamples.length,
        usableSampleCount: scores.length,
        dataStatus:
          scores.length > 0
            ? ("available" as const)
            : ("insufficient-data" as const),
        averageHeartRateBpm: average(
          bucketSamples.map((sample) => sample.heartRateBpm),
        ),
        averageStressLevel: average(
          bucketSamples.map((sample) => sample.stressLevel),
        ),
        averageHrvRmssd: average(
          bucketSamples.map((sample) => sample.hrvRmssd),
        ),
        intensityScore:
          scores.length > 0
            ? clamp(
                Math.round(
                  scores.reduce((sum, score) => sum + score, 0) / scores.length,
                ),
                0,
                100,
              )
            : null,
      };
    });
}

export function extractIntenseMoments(
  buckets: FilmIntensityBucket[],
  topCount = 5,
): IntenseMoment[] {
  return [...buckets]
    .filter(hasIntensityScore)
    .sort((left, right) => right.intensityScore - left.intensityScore)
    .slice(0, topCount)
    .map((bucket, index) => ({
      bucketStartMs: bucket.bucketStartMs,
      label: `Peak ${index + 1}`,
      intensityScore: bucket.intensityScore,
      viewerCount: Math.max(
        1,
        Math.round((bucket.usableSampleCount ?? bucket.sampleCount) / 3),
      ),
    }));
}

export function summarizeBuckets(
  buckets: FilmIntensityBucket[],
): FilmIntensitySummary {
  const scored = buckets.filter(hasIntensityScore);
  const totalSampleCount = buckets.reduce(
    (sum, bucket) => sum + bucket.sampleCount,
    0,
  );
  const countsKnown = buckets.every(
    (bucket) => bucket.usableSampleCount !== undefined,
  );
  const usableSampleCount = countsKnown
    ? buckets.reduce((sum, bucket) => sum + (bucket.usableSampleCount ?? 0), 0)
    : null;
  const coverage = {
    totalSampleCount,
    usableSampleCount,
    sampleCoverage:
      totalSampleCount > 0 && usableSampleCount !== null
        ? usableSampleCount / totalSampleCount
        : null,
  };
  if (!scored.length) {
    return {
      averageIntensity: null,
      peakIntensity: null,
      dominantBand: null,
      dataStatus: "insufficient-data",
      ...coverage,
    };
  }

  const averageIntensity = Math.round(
    scored.reduce((sum, bucket) => sum + bucket.intensityScore, 0) /
      scored.length,
  );
  const peakIntensity = scored.reduce(
    (peak, bucket) => Math.max(peak, bucket.intensityScore),
    0,
  );

  return {
    averageIntensity,
    peakIntensity,
    dominantBand: classifyIntensity(peakIntensity),
    dataStatus: "available",
    ...coverage,
  };
}
