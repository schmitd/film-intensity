import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bucketizeSamples } from "@film-intensity/shared";
import { Timeline } from "./timeline";

const missing = {
  timestamp: 0,
  elapsedMs: 0,
  heartRateBpm: null,
  stressLevel: null,
  hrvRmssd: null,
  heartBeatIntervalsMs: [],
};

describe("timeline unavailable states", () => {
  it("renders all-missing buckets as neutral gaps without calm bars or numeric scores", () => {
    const html = renderToStaticMarkup(
      createElement(Timeline, { buckets: bucketizeSamples([missing]) }),
    );
    expect(html).toContain("Insufficient data");
    expect(html).toContain('class="curve-gap"');
    expect(html).not.toContain("calm");
    expect(html).not.toContain("curve-pulse");
    expect(html).not.toContain("Intensity 0");
    expect(html).toContain("0 of 1 received samples");
  });

  it("keeps gaps visible in mixed data and out of ranked windows", () => {
    const html = renderToStaticMarkup(
      createElement(Timeline, {
        buckets: bucketizeSamples([
          { ...missing, heartRateBpm: 80 },
          { ...missing, elapsedMs: 5000 },
        ]),
      }),
    );
    expect(html).toContain('class="curve-gap"');
    expect(html).toContain('class="curve-pulse calm"');
    expect(html).toContain("1 of 2 received samples");
    expect(html.match(/class="timeline-row /g) ?? []).toHaveLength(1);
  });

  it("distinguishes a legitimate score zero from unavailable data", () => {
    const bucket = {
      bucketStartMs: 0,
      sampleCount: 1,
      usableSampleCount: 1,
      dataStatus: "available" as const,
      averageHeartRateBpm: 30,
      averageStressLevel: null,
      averageHrvRmssd: null,
      intensityScore: 0,
    };
    const html = renderToStaticMarkup(
      createElement(Timeline, { buckets: [bucket] }),
    );
    expect(html).toContain('class="curve-pulse calm"');
    expect(html).toContain("intensity 0");
    expect(html).not.toContain('class="curve-gap"');
  });

  it("empty data contains no calm fallback", () => {
    const html = renderToStaticMarkup(createElement(Timeline, { buckets: [] }));
    expect(html).toContain("Insufficient data");
    expect(html).not.toContain("calm");
  });
});
