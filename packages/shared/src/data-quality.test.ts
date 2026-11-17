import { describe, expect, it } from "vitest";
import {
  type BiometricSample,
  filmIntensityBucketSchema,
  filmIntensitySummarySchema,
  schemaVersion,
  intensityReadSchemaVersion,
} from "./contracts";
import {
  bucketizeSamples,
  classifyIntensity,
  computeSampleIntensity,
  extractIntenseMoments,
  summarizeBuckets,
} from "./scoring";

const missing: BiometricSample = {
  timestamp: 0,
  elapsedMs: 0,
  heartRateBpm: null,
  stressLevel: null,
  hrvRmssd: null,
  heartBeatIntervalsMs: [],
};

describe("score availability", () => {
  it("keeps finite large accepted inputs from overflowing mean calculations", () => {
    const buckets = bucketizeSamples([
      { ...missing, hrvRmssd: 1e308 },
      { ...missing, timestamp: 1000, elapsedMs: 1000, hrvRmssd: 1e308 },
    ]);
    expect(buckets[0]).toMatchObject({
      dataStatus: "available",
      usableSampleCount: 2,
      averageHrvRmssd: 1e308,
      intensityScore: 40,
    });
    expect(filmIntensityBucketSchema.safeParse(buckets[0]).success).toBe(true);
  });
  it("never classifies absent inputs as calm or zero", () => {
    expect(computeSampleIntensity(missing)).toBeNull();
    expect(classifyIntensity(null)).toBeNull();
    expect(classifyIntensity(NaN)).toBeNull();
    const buckets = bucketizeSamples([missing]);
    expect(buckets[0]).toMatchObject({
      intensityScore: null,
      dataStatus: "insufficient-data",
      sampleCount: 1,
      usableSampleCount: 0,
    });
    expect(extractIntenseMoments(buckets)).toEqual([]);
    expect(summarizeBuckets(buckets)).toMatchObject({
      averageIntensity: null,
      peakIntensity: null,
      dominantBand: null,
      dataStatus: "insufficient-data",
      sampleCoverage: 0,
    });
    expect(summarizeBuckets([])).toMatchObject({
      averageIntensity: null,
      peakIntensity: null,
      dominantBand: null,
      totalSampleCount: 0,
      usableSampleCount: 0,
      sampleCoverage: null,
    });
  });

  it("does not dilute a usable score with null rows or gap buckets", () => {
    const valid = { ...missing, heartRateBpm: 80 };
    const baseline = summarizeBuckets(bucketizeSamples([valid]));
    const buckets = bucketizeSamples([
      valid,
      { ...missing, elapsedMs: 1000 },
      { ...missing, elapsedMs: 5000 },
    ]);
    const summary = summarizeBuckets(buckets);
    expect(buckets[0]).toMatchObject({
      intensityScore: baseline.peakIntensity,
      sampleCount: 2,
      usableSampleCount: 1,
    });
    expect(buckets[1].intensityScore).toBeNull();
    expect(summary).toMatchObject({
      peakIntensity: baseline.peakIntensity,
      averageIntensity: baseline.averageIntensity,
      totalSampleCount: 3,
      usableSampleCount: 1,
      sampleCoverage: 1 / 3,
    });
    expect(extractIntenseMoments(buckets)).toHaveLength(1);
  });

  it.each([{ heartRateBpm: 80 }, { stressLevel: 0 }, { hrvRmssd: 0 }])(
    "scores partial signal support: %j",
    (signal) => {
      const bucket = bucketizeSamples([{ ...missing, ...signal }])[0];
      expect(bucket.dataStatus).toBe("available");
      expect(bucket.usableSampleCount).toBe(1);
      expect(bucket.intensityScore).not.toBeNull();
    },
  );

  it("keeps genuine zero scores distinct from missing scores", () => {
    const sample = {
      ...missing,
      heartRateBpm: 1,
      stressLevel: 0,
      hrvRmssd: 100,
    };
    expect(
      computeSampleIntensity(sample, { heartRate: 70, stress: 20, hrv: 42 }),
    ).toBe(0);
    expect(classifyIntensity(0)).toBe("calm");
  });

  it("ignores non-finite legacy values rather than emitting NaN", () => {
    expect(
      computeSampleIntensity({
        ...missing,
        heartRateBpm: NaN,
        stressLevel: Infinity,
      }),
    ).toBeNull();
    const bucket = bucketizeSamples([
      { ...missing, heartRateBpm: NaN, stressLevel: 0 },
    ])[0];
    expect(bucket).toMatchObject({
      dataStatus: "available",
      averageHeartRateBpm: null,
      averageStressLevel: 0,
    });
    expect(Number.isFinite(bucket.intensityScore)).toBe(true);
  });

  it("accepts old numeric read payloads without claiming known coverage", () => {
    const bucket = filmIntensityBucketSchema.parse({
      bucketStartMs: 0,
      sampleCount: 1,
      averageHeartRateBpm: 80,
      averageStressLevel: null,
      averageHrvRmssd: null,
      intensityScore: 40,
    });
    expect(bucket.usableSampleCount).toBeUndefined();
    expect(summarizeBuckets([bucket])).toMatchObject({
      dataStatus: "available",
      usableSampleCount: null,
      sampleCoverage: null,
    });
    expect(
      filmIntensitySummarySchema.parse({
        averageIntensity: 40,
        peakIntensity: 40,
        dominantBand: "calm",
      }).dataStatus,
    ).toBeUndefined();
    expect(schemaVersion).toBe(1);
    expect(intensityReadSchemaVersion).toBe(2);
  });

  it("validates current nullable read outputs", () => {
    const buckets = bucketizeSamples([missing]);
    expect(filmIntensityBucketSchema.safeParse(buckets[0]).success).toBe(true);
    expect(
      filmIntensitySummarySchema.safeParse(summarizeBuckets(buckets)).success,
    ).toBe(true);
  });
});
