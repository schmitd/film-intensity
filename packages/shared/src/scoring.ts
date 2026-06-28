import type {
  BiometricSample,
  FilmIntensityBucket,
  FilmIntensitySummary,
  IntenseMoment,
} from "./contracts";

export const DEFAULT_BUCKET_MS = 5_000;

type NullableNumber = number | null;

function average(values: Array<NullableNumber>): NullableNumber {
  const numericValues = values.filter((value): value is number => value !== null);
  if (!numericValues.length) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
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
): number {
  const heartRateDelta =
    sample.heartRateBpm === null ? 0 : (sample.heartRateBpm - baseline.heartRate) / 30;
  const stressDelta =
    sample.stressLevel === null ? 0 : (sample.stressLevel - baseline.stress) / 50;
  const hrvSuppression =
    sample.hrvRmssd === null ? 0 : (baseline.hrv - sample.hrvRmssd) / Math.max(baseline.hrv, 10);

  const weighted = heartRateDelta * 0.5 + stressDelta * 0.35 + hrvSuppression * 0.3;
  return clamp(Math.round((weighted + 0.4) * 100), 0, 100);
}

export function classifyIntensity(score: number) {
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
    .map(([bucketStartMs, bucketSamples]) => ({
      bucketStartMs,
      sampleCount: bucketSamples.length,
      averageHeartRateBpm: average(bucketSamples.map((sample) => sample.heartRateBpm)),
      averageStressLevel: average(bucketSamples.map((sample) => sample.stressLevel)),
      averageHrvRmssd: average(bucketSamples.map((sample) => sample.hrvRmssd)),
      intensityScore: clamp(
        Math.round(
          bucketSamples.reduce(
            (sum, sample) => sum + computeSampleIntensity(sample, baseline),
            0,
          ) / bucketSamples.length,
        ),
        0,
        100,
      ),
    }));
}

export function extractIntenseMoments(
  buckets: FilmIntensityBucket[],
  topCount = 5,
): IntenseMoment[] {
  return [...buckets]
    .sort((left, right) => right.intensityScore - left.intensityScore)
    .slice(0, topCount)
    .map((bucket, index) => ({
      bucketStartMs: bucket.bucketStartMs,
      label: `Peak ${index + 1}`,
      intensityScore: bucket.intensityScore,
      viewerCount: Math.max(1, Math.round(bucket.sampleCount / 3)),
    }));
}

export function summarizeBuckets(buckets: FilmIntensityBucket[]): FilmIntensitySummary {
  if (!buckets.length) {
    return {
      averageIntensity: 0,
      peakIntensity: 0,
      dominantBand: "calm",
    };
  }

  const averageIntensity = Math.round(
    buckets.reduce((sum, bucket) => sum + bucket.intensityScore, 0) / buckets.length,
  );
  const peakIntensity = buckets.reduce(
    (peak, bucket) => Math.max(peak, bucket.intensityScore),
    0,
  );

  return {
    averageIntensity,
    peakIntensity,
    dominantBand: classifyIntensity(peakIntensity),
  };
}
