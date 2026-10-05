import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";

import type { BiometricSample } from "@film-intensity/shared";
import { POST as uploadBatch } from "../app/api/device/session-batch/route";
import { POST as complete } from "../app/api/device/session-complete/route";
import { POST as start } from "../app/api/device/session-start/route";
import { createSession, getSessionById, pairDevice } from "./store";

const disk = vi.hoisted(() => ({ json: "" }));
vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(async () => disk.json),
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (_path: string, data: string) => {
      disk.json = data;
    }),
  },
}));

const timestamp = Date.parse("2026-06-29T00:00:00.000Z");
const capabilities = { heartRate: true, stress: false, hrv: false };
function sample(offset: number, iso = false): BiometricSample {
  return {
    timestamp: iso
      ? new Date(timestamp + offset).toISOString()
      : timestamp + offset,
    elapsedMs: offset,
    heartRateBpm: 80,
    stressLevel: null,
    hrvRmssd: null,
    heartBeatIntervalsMs: [],
  };
}

function request(payload: unknown) {
  return new Request("http://localhost/api/device/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function pairedSession() {
  const session = await createSession({
    filmId: "manual-test",
    filmTitle: "Test screening",
    runtimeMinutes: 3,
    pairCode: "123456",
    consentAccepted: true,
  });
  const paired = await pairDevice({
    pairCode: session.pairCode,
    deviceId: "test-watch",
    deviceModel: "Venu 2",
    appVersion: "0.1.0",
  });
  return {
    schemaVersion: 1,
    sessionId: session.id,
    deviceId: "test-watch",
    deviceToken: paired!.deviceToken,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  disk.json = JSON.stringify({ films: [], sessions: [] });
  globalThis.__filmIntensityStoreCache = undefined;
});

describe("device upload integrity", () => {
  it("acknowledges lost-response retries without inserting duplicate samples", async () => {
    const identity = await pairedSession();
    const payload = { ...identity, samples: [sample(0), sample(5000)] };
    expect((await uploadBatch(request(payload))).status).toBe(200);
    // Reload persisted state to model a backend restart between request and retry.
    globalThis.__filmIntensityStoreCache = undefined;
    const response = await uploadBatch(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      acceptedSamples: 2,
      totalSamples: 2,
    });
    expect((await getSessionById(identity.sessionId))?.samples).toHaveLength(2);
  });

  it("deduplicates partial overlap, duplicate rows, and ISO/epoch equivalents", async () => {
    const identity = await pairedSession();
    await uploadBatch(
      request({ ...identity, samples: [sample(0), sample(5000)] }),
    );
    const response = await uploadBatch(
      request({
        ...identity,
        samples: [sample(5000, true), sample(10000), sample(10000)],
      }),
    );
    expect(await response.json()).toMatchObject({
      acceptedSamples: 3,
      totalSamples: 3,
    });
  });

  it("persists a replay after a transient write failure before acknowledging it", async () => {
    const identity = await pairedSession();
    const payload = { ...identity, samples: [sample(0)] };
    vi.mocked(fs.writeFile).mockRejectedValueOnce(
      new Error("temporary write failure"),
    );
    await expect(uploadBatch(request(payload))).rejects.toThrow(
      "temporary write failure",
    );
    expect((await uploadBatch(request(payload))).status).toBe(200);
    globalThis.__filmIntensityStoreCache = undefined;
    expect((await getSessionById(identity.sessionId))?.samples).toEqual([
      sample(0),
    ]);
  });

  it("persists completion on retry after a transient write failure", async () => {
    const identity = await pairedSession();
    await uploadBatch(request({ ...identity, samples: [sample(0)] }));
    const payload = {
      ...identity,
      completedAt: new Date(timestamp).toISOString(),
      totalSamples: 1,
      capabilities,
    };
    vi.mocked(fs.writeFile).mockRejectedValueOnce(
      new Error("temporary write failure"),
    );
    await expect(complete(request(payload))).rejects.toThrow(
      "temporary write failure",
    );
    expect((await complete(request(payload))).status).toBe(200);
    globalThis.__filmIntensityStoreCache = undefined;
    expect(await getSessionById(identity.sessionId)).toMatchObject({
      status: "complete",
      completedAt: payload.completedAt,
    });
  });

  it("rejects conflicting replay data atomically, including within one batch", async () => {
    const identity = await pairedSession();
    await uploadBatch(request({ ...identity, samples: [sample(0)] }));
    const conflict = { ...sample(0), heartRateBpm: 120 };
    const response = await uploadBatch(
      request({ ...identity, samples: [sample(5000), conflict] }),
    );
    expect(response.status).toBe(409);
    expect((await getSessionById(identity.sessionId))?.samples).toEqual([
      sample(0),
    ]);
    const withinBatch = await uploadBatch(
      request({
        ...identity,
        samples: [sample(10000), { ...sample(10000), hrvRmssd: 30 }],
      }),
    );
    expect(withinBatch.status).toBe(409);
    expect((await getSessionById(identity.sessionId))?.samples).toEqual([
      sample(0),
    ]);
  });

  it("uses actual Garmin millisecond payloads through recording and completion", async () => {
    const identity = await pairedSession();
    const started = await start(request({ ...identity, startedAt: timestamp }));
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({ status: "recording" });
    await uploadBatch(request({ ...identity, samples: [sample(0)] }));
    const finished = await complete(
      request({
        ...identity,
        completedAt: timestamp + 5000,
        totalSamples: 1,
        capabilities,
      }),
    );
    expect(finished.status).toBe(200);
    expect((await getSessionById(identity.sessionId))?.completedAt).toBe(
      "2026-06-29T00:00:05.000Z",
    );
  });

  it("keeps completion terminal while acknowledging duplicate uploads and completion retries", async () => {
    const identity = await pairedSession();
    const samples = [sample(0), sample(5000)];
    await uploadBatch(request({ ...identity, samples }));
    await complete(
      request({
        ...identity,
        completedAt: new Date(timestamp + 10000).toISOString(),
        totalSamples: 2,
        capabilities,
      }),
    );
    globalThis.__filmIntensityStoreCache = undefined;
    const replay = await uploadBatch(request({ ...identity, samples }));
    expect(await replay.json()).toMatchObject({
      acceptedSamples: 2,
      totalSamples: 2,
      sessionStatus: "complete",
    });
    const later = await uploadBatch(
      request({ ...identity, samples: [sample(10000)] }),
    );
    expect(later.status).toBe(409);
    const retry = await complete(
      request({
        ...identity,
        completedAt: new Date(timestamp + 20000).toISOString(),
        totalSamples: 2,
        capabilities: { ...capabilities, stress: true },
      }),
    );
    expect(retry.status).toBe(200);
    const session = await getSessionById(identity.sessionId);
    expect(session).toMatchObject({
      status: "complete",
      completedAt: "2026-06-29T00:00:10.000Z",
      capabilities,
    });
    expect(session?.samples).toHaveLength(2);
    expect(
      (
        await start(
          request({
            ...identity,
            startedAt: new Date(timestamp).toISOString(),
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      await pairDevice({
        pairCode: "123456",
        deviceId: "test-watch",
        deviceModel: "Venu 2",
        appVersion: "0.1.0",
      }),
    ).toBeNull();
    expect((await getSessionById(identity.sessionId))?.status).toBe("complete");
  });

  it.each([0, 2])(
    "rejects a completion count of %s when one sample is stored",
    async (totalSamples) => {
      const identity = await pairedSession();
      await uploadBatch(request({ ...identity, samples: [sample(0)] }));
      const response = await complete(
        request({
          ...identity,
          completedAt: new Date(timestamp).toISOString(),
          totalSamples,
          capabilities,
        }),
      );
      expect(response.status).toBe(409);
      expect((await getSessionById(identity.sessionId))?.status).toBe(
        "uploading",
      );
    },
  );

  it("supports an empty completed capture and rejects mismatched completion retries", async () => {
    const identity = await pairedSession();
    const completedAt = new Date(timestamp).toISOString();
    expect(
      (
        await complete(
          request({ ...identity, completedAt, totalSamples: 0, capabilities }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await complete(
          request({ ...identity, completedAt, totalSamples: 1, capabilities }),
        )
      ).status,
    ).toBe(409);
    expect(await getSessionById(identity.sessionId)).toMatchObject({
      status: "complete",
      completedAt,
      samples: [],
    });
  });

  it("keeps invalid device credentials from changing upload or completion state", async () => {
    const identity = await pairedSession();
    const invalid = { ...identity, deviceToken: "incorrect-token" };
    expect(
      (await uploadBatch(request({ ...invalid, samples: [sample(0)] }))).status,
    ).toBe(404);
    expect(
      (
        await complete(
          request({
            ...invalid,
            completedAt: new Date(timestamp).toISOString(),
            totalSamples: 0,
            capabilities,
          }),
        )
      ).status,
    ).toBe(404);
    expect((await getSessionById(identity.sessionId))?.status).toBe("paired");
  });
});
