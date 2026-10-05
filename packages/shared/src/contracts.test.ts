import { describe, expect, it } from "vitest";

import {
  activeDeviceSessionResponseSchema,
  biometricSampleSchema,
  schemaVersion,
  sessionStartSchema,
  sessionCompleteSchema,
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

describe("Garmin session timestamps", () => {
  const identity = {
    schemaVersion,
    sessionId: "session_123",
    deviceId: "garmin_abc",
    deviceToken: "token_1234567890abcdef",
  };
  const completed = {
    ...identity,
    totalSamples: 24,
    capabilities: { heartRate: true, stress: false, hrv: false },
  };

  it("normalizes actual Garmin epoch-millisecond start and completion payloads", () => {
    const timestamp = Date.parse("2026-06-29T00:00:00.000Z");
    expect(
      sessionStartSchema.parse({ ...identity, startedAt: timestamp }).startedAt,
    ).toBe("2026-06-29T00:00:00.000Z");
    expect(
      sessionCompleteSchema.parse({ ...completed, completedAt: timestamp })
        .completedAt,
    ).toBe("2026-06-29T00:00:00.000Z");
  });

  it("keeps ISO timestamp callers compatible", () => {
    const timestamp = "2026-06-29T00:00:00.000Z";
    expect(
      sessionStartSchema.parse({ ...identity, startedAt: timestamp }).startedAt,
    ).toBe(timestamp);
    expect(
      sessionCompleteSchema.parse({ ...completed, completedAt: timestamp })
        .completedAt,
    ).toBe(timestamp);
  });

  it.each([-1, 1.5, Infinity, NaN, 8_640_000_000_000_001, "invalid", null])(
    "rejects an invalid timestamp without throwing from safeParse: %s",
    (timestamp) => {
      expect(
        sessionStartSchema.safeParse({ ...identity, startedAt: timestamp })
          .success,
      ).toBe(false);
      expect(
        sessionCompleteSchema.safeParse({
          ...completed,
          completedAt: timestamp,
        }).success,
      ).toBe(false);
    },
  );
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

describe("sessionStartSchema", () => {
  it("accepts the device recording-start payload", () => {
    const parsed = sessionStartSchema.parse({
      schemaVersion,
      sessionId: "session_123",
      deviceId: "garmin_abc",
      deviceToken: "token_1234567890abcdef",
      startedAt: "2026-06-29T00:00:00.000Z",
    });

    expect(parsed.sessionId).toBe("session_123");
  });
});
