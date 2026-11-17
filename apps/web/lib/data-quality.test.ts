import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BiometricSample } from "@film-intensity/shared";
import {
  getDashboardSnapshot,
  getFeaturedFilms,
  getFilmBuckets,
  getFilmMoments,
  getFilmSummary,
} from "./store";
import { GET as readIntensity } from "../app/api/web/films/[filmId]/intensity/route";

const disk = vi.hoisted(() => ({ json: "" }));
vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(async () => disk.json),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));
const missing: BiometricSample = {
  timestamp: 0,
  elapsedMs: 0,
  heartRateBpm: null,
  stressLevel: null,
  hrvRmssd: null,
  heartBeatIntervalsMs: [],
};

function seed(sessions: Array<{ filmId: string; samples: BiometricSample[] }>) {
  const filmIds = [...new Set(sessions.map((s) => s.filmId))];
  // Historical records contain raw samples only: no availability metadata/migration.
  disk.json = JSON.stringify({
    films: filmIds.map((id) => ({
      id,
      title: id,
      runtimeMinutes: 3,
      director: "Unknown",
      logline: "Test",
      tone: "Test",
      watchFit: "Test",
      peakWindowHint: "Test",
    })),
    sessions: sessions.map((s, i) => ({
      ...s,
      id: `session-${i}`,
      filmTitle: s.filmId,
      runtimeMinutes: 3,
      userId: "local_user",
      pairCode: `00000${i}`,
      status: "complete",
      startsAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      capabilities: { heartRate: true, stress: false, hrv: false },
    })),
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  globalThis.__filmIntensityStoreCache = undefined;
});

describe("film availability aggregation", () => {
  it("averages large finite metrics across viewers without overflow", async () => {
    seed([
      { filmId: "large", samples: [{ ...missing, hrvRmssd: 1e308 }] },
      { filmId: "large", samples: [{ ...missing, hrvRmssd: 1e308 }] },
    ]);
    expect((await getFilmBuckets("large"))[0]).toMatchObject({
      averageHrvRmssd: 1e308,
      intensityScore: 40,
      dataStatus: "available",
      usableSampleCount: 2,
    });
  });
  it("preserves legacy storage while returning explicit null API scores and counts", async () => {
    seed([{ filmId: "missing", samples: [missing] }]);
    expect(await getFilmSummary("missing")).toMatchObject({
      dataStatus: "insufficient-data",
      peakIntensity: null,
      averageIntensity: null,
      dominantBand: null,
      sampleCoverage: 0,
    });
    expect(await getFilmMoments("missing")).toEqual([]);
    expect(await getDashboardSnapshot()).toMatchObject({
      averagePeakIntensity: null,
      mostIntenseFilmId: "",
    });
    const response = await readIntensity(
      new Request("http://localhost/api/test"),
      { params: Promise.resolve({ filmId: "missing" }) },
    );
    const body = await response.json();
    expect(body.schemaVersion).toBe(2);
    expect(body.buckets[0]).toHaveProperty("intensityScore", null);
    expect(body.summary).toMatchObject({
      dataStatus: "insufficient-data",
      totalSampleCount: 1,
      usableSampleCount: 0,
    });
  });

  it("missing viewers do not dilute present metrics or erase genuine zeros", async () => {
    seed([
      {
        filmId: "mixed",
        samples: [
          { ...missing, heartRateBpm: 80, stressLevel: 0, hrvRmssd: 0 },
        ],
      },
      { filmId: "mixed", samples: [missing] },
    ]);
    const [bucket] = await getFilmBuckets("mixed");
    expect(bucket).toMatchObject({
      dataStatus: "available",
      sampleCount: 2,
      usableSampleCount: 1,
      averageHeartRateBpm: 80,
      averageStressLevel: 0,
      averageHrvRmssd: 0,
      intensityScore: 40,
    });
    expect(await getFilmSummary("mixed")).toMatchObject({
      sampleCoverage: 0.5,
    });
  });

  it("ranks only available films by score and excludes unavailable films from averages", async () => {
    seed([
      { filmId: "missing", samples: [missing] },
      {
        filmId: "valid",
        samples: [
          { ...missing, heartRateBpm: 40 },
          { ...missing, timestamp: 5000, elapsedMs: 5000, heartRateBpm: 200 },
        ],
      },
    ]);
    const films = await getFeaturedFilms();
    expect(films.map((film) => film.id)).toEqual(["valid", "missing"]);
    expect(await getDashboardSnapshot()).toMatchObject({
      mostIntenseFilmId: "valid",
      averagePeakIntensity: 100,
    });
  });

  it("empty completed captures have unknown coverage and no invented score", async () => {
    seed([{ filmId: "empty", samples: [] }]);
    expect(await getFilmSummary("empty")).toMatchObject({
      dataStatus: "insufficient-data",
      sampleCoverage: null,
      totalSampleCount: 0,
      peakIntensity: null,
    });
  });
});
