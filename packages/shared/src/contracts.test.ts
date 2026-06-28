import { describe, expect, it } from "vitest";

import {
  activeDeviceSessionResponseSchema,
  biometricSampleSchema,
} from "./contracts";

describe("biometricSampleSchema", () => {
  it("accepts unix epoch timestamps for device uploads", () => {
    const parsed = biometricSampleSchema.parse({
      timestamp: 1_719_305_400_000,
      elapsedMs: 5_000,
      heartRateBpm: 87,
      stressLevel: null,
      hrvRmssd: 31,
      heartBeatIntervalsMs: [730, 722, 718],
    });

    expect(parsed.timestamp).toBe(1_719_305_400_000);
  });
});

describe("activeDeviceSessionResponseSchema", () => {
  it("accepts a device-facing active session payload", () => {
    const parsed = activeDeviceSessionResponseSchema.parse({
      session: {
        id: "session_123",
        filmId: "tmdb-603",
        filmTitle: "The Matrix",
        runtimeMinutes: 136,
        pairCode: "603603",
        startsAt: "2026-06-25T00:00:00.000Z",
        status: "paired",
        capabilities: {
          heartRate: true,
          stress: false,
          hrv: true,
        },
      },
    });

    expect(parsed.session?.capabilities.hrv).toBe(true);
  });
});
