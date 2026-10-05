import { describe, expect, it } from "vitest";

import { demoSamples } from "./demo-data";
import {
  bucketizeSamples,
  classifyIntensity,
  computeBaseline,
  computeSampleIntensity,
  extractIntenseMoments,
  summarizeBuckets,
} from "./scoring";

describe("scoring", () => {
  it("computes a usable baseline from mixed biometric samples", () => {
    const baseline = computeBaseline(demoSamples);

    expect(baseline.heartRate).toBeGreaterThan(70);
    expect(baseline.stress).toBeGreaterThan(15);
    expect(baseline.hrv).toBeGreaterThan(10);
  });

  it("assigns a higher intensity to the peak scene sample", () => {
    const baseline = computeBaseline(demoSamples);
    const calmScore = computeSampleIntensity(demoSamples[0], baseline);
    const peakScore = computeSampleIntensity(demoSamples[7], baseline);

    if (calmScore === null || peakScore === null)
      throw new Error("Demo signals must remain scoreable");

    expect(peakScore).toBeGreaterThan(calmScore);
  });

  it("extracts ranked intense moments from 5-second buckets", () => {
    const buckets = bucketizeSamples(demoSamples);
    const moments = extractIntenseMoments(buckets, 3);

    expect(buckets.length).toBeGreaterThan(0);
    expect(moments).toHaveLength(3);
    expect(moments[0]?.intensityScore).toBeGreaterThanOrEqual(
      moments[1]?.intensityScore ?? 0,
    );
  });

  it("summarizes bucket bands for UI usage", () => {
    const summary = summarizeBuckets(bucketizeSamples(demoSamples));

    if (summary.averageIntensity === null)
      throw new Error("Demo signals must remain scoreable");

    expect(summary.peakIntensity).toBeGreaterThan(summary.averageIntensity);
    expect(classifyIntensity(summary.peakIntensity)).toBe(summary.dominantBand);
  });
});
