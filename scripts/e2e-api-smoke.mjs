const baseUrl = process.env.FILM_INTENSITY_BASE_URL ?? "http://localhost:3000";
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const pairCode = `E2E${runId.slice(-6).toUpperCase()}`.slice(0, 9);
const deviceId = `e2e-device-${runId}`;
const filmId = `e2e-film-${runId}`;
const filmTitle = `E2E Screening ${runId}`;

async function request(path, options = {}, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (expectedStatus ? response.status !== expectedStatus : !response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed with ${response.status}: ${text}`,
    );
  }

  return body;
}

function sample(elapsedMs, heartRateBpm, stressLevel, hrvRmssd) {
  return {
    timestamp: new Date(Date.now() + elapsedMs).toISOString(),
    elapsedMs,
    heartRateBpm,
    stressLevel,
    hrvRmssd,
    heartBeatIntervalsMs: [830, 810, 805],
  };
}

const created = await request("/api/web/sessions", {
  method: "POST",
  body: JSON.stringify({
    filmId,
    filmTitle,
    runtimeMinutes: 3,
    pairCode,
    consentAccepted: true,
  }),
});

const session = created.session;
if (!session?.id || session.pairCode !== pairCode) {
  throw new Error(
    "Session creation did not return the expected id and pair code.",
  );
}

const paired = await request("/api/device/pair", {
  method: "POST",
  body: JSON.stringify({
    pairCode,
    deviceId,
    deviceModel: "E2E Garmin",
    appVersion: "0.0.0-e2e",
  }),
});

if (!paired.deviceToken || paired.activeSessionId !== session.id) {
  throw new Error(
    "Pairing did not return the expected device token and active session id.",
  );
}

const active = await request(
  `/api/device/active-session?deviceId=${encodeURIComponent(deviceId)}&deviceToken=${encodeURIComponent(
    paired.deviceToken,
  )}`,
);

if (active.session?.id !== session.id) {
  throw new Error("Active session lookup did not return the paired session.");
}

const started = await request("/api/device/session-start", {
  method: "POST",
  body: JSON.stringify({
    schemaVersion: 1,
    sessionId: session.id,
    deviceId,
    deviceToken: paired.deviceToken,
    // Match the actual Garmin payload, not only the browser's ISO representation.
    startedAt: Date.now(),
  }),
});

if (started.status !== "recording") {
  throw new Error("Session start did not mark the session recording.");
}

const deviceIdentity = {
  schemaVersion: 1,
  sessionId: session.id,
  deviceId,
  deviceToken: paired.deviceToken,
};
const samples = [
  sample(0, 72, 18, 61),
  sample(15_000, 86, 34, 53),
  sample(30_000, 104, 72, 39),
  sample(45_000, 98, 68, 42),
];
const batchPayload = { ...deviceIdentity, samples };
const batch = await request("/api/device/session-batch", {
  method: "POST",
  body: JSON.stringify(batchPayload),
});

if (batch.acceptedSamples !== 4 || batch.totalSamples !== 4) {
  throw new Error("Batch upload did not accept the expected samples.");
}

const replayed = await request("/api/device/session-batch", {
  method: "POST",
  body: JSON.stringify(batchPayload),
});
if (replayed.acceptedSamples !== 4 || replayed.totalSamples !== 4) {
  throw new Error(
    "Replayed upload did not acknowledge all rows without duplicates.",
  );
}

// Conflicts must not partially insert the valid new sample preceding them.
await request(
  "/api/device/session-batch",
  {
    method: "POST",
    body: JSON.stringify({
      ...deviceIdentity,
      samples: [
        sample(60_000, 70, 20, 60),
        { ...samples[0], heartRateBpm: 120 },
      ],
    }),
  },
  409,
);

await request(
  "/api/device/session-complete",
  {
    method: "POST",
    body: JSON.stringify({
      ...deviceIdentity,
      completedAt: Date.now(),
      totalSamples: 5,
      capabilities: { heartRate: true, stress: true, hrv: true },
    }),
  },
  409,
);

const completed = await request("/api/device/session-complete", {
  method: "POST",
  body: JSON.stringify({
    schemaVersion: 1,
    sessionId: session.id,
    deviceId,
    deviceToken: paired.deviceToken,
    completedAt: Date.now(),
    totalSamples: batch.totalSamples,
    capabilities: {
      heartRate: true,
      stress: true,
      hrv: true,
    },
  }),
});

if (completed.status !== "complete") {
  throw new Error("Session completion did not mark the session complete.");
}

const completedReplay = await request("/api/device/session-batch", {
  method: "POST",
  body: JSON.stringify(batchPayload),
});
if (
  completedReplay.sessionStatus !== "complete" ||
  completedReplay.totalSamples !== 4
) {
  throw new Error(
    "Duplicate upload reopened or changed the completed session.",
  );
}

await request(
  "/api/device/session-batch",
  {
    method: "POST",
    body: JSON.stringify({
      ...deviceIdentity,
      samples: [sample(60_000, 70, 20, 60)],
    }),
  },
  409,
);

const completionRetry = await request("/api/device/session-complete", {
  method: "POST",
  body: JSON.stringify({
    ...deviceIdentity,
    completedAt: Date.now() + 1000,
    totalSamples: 4,
    capabilities: { heartRate: true, stress: false, hrv: false },
  }),
});
if (
  completionRetry.status !== "complete" ||
  completionRetry.totalSamples !== 4
) {
  throw new Error("Completion retry did not preserve the completed session.");
}

const normalizedFilmId = filmId.startsWith("tmdb-") ? filmId : `tmdb-${filmId}`;
const intensity = await request(
  `/api/web/films/${encodeURIComponent(normalizedFilmId)}/intensity`,
);
const moments = await request(
  `/api/web/films/${encodeURIComponent(normalizedFilmId)}/moments`,
);

if (!Array.isArray(intensity.buckets) || intensity.buckets.length === 0) {
  throw new Error("Intensity endpoint returned no buckets after completion.");
}

if (!Array.isArray(moments.moments) || moments.moments.length === 0) {
  throw new Error("Moments endpoint returned no moments after completion.");
}

if (
  intensity.schemaVersion !== 2 ||
  intensity.summary?.dataStatus !== "available"
) {
  throw new Error(
    "Intensity read contract did not declare version 2 with available data.",
  );
}

const missingFilmId = `manual-missing-${runId}`;
const missingCode = `GAP${runId.slice(-6).toUpperCase()}`;
const missingSession = (
  await request("/api/web/sessions", {
    method: "POST",
    body: JSON.stringify({
      filmId: missingFilmId,
      filmTitle: "Missing-signal smoke test",
      runtimeMinutes: 3,
      pairCode: missingCode,
      consentAccepted: true,
    }),
  })
).session;
const missingPair = await request("/api/device/pair", {
  method: "POST",
  body: JSON.stringify({
    pairCode: missingCode,
    deviceId: `${deviceId}-missing`,
    deviceModel: "E2E Garmin",
    appVersion: "0.0.0-e2e",
  }),
});
const missingIdentity = {
  schemaVersion: 1,
  sessionId: missingSession.id,
  deviceId: `${deviceId}-missing`,
  deviceToken: missingPair.deviceToken,
};
await request("/api/device/session-batch", {
  method: "POST",
  body: JSON.stringify({
    ...missingIdentity,
    samples: [sample(0, null, null, null), sample(5000, null, null, null)],
  }),
});
await request("/api/device/session-complete", {
  method: "POST",
  body: JSON.stringify({
    ...missingIdentity,
    completedAt: Date.now(),
    totalSamples: 2,
    capabilities: { heartRate: false, stress: false, hrv: false },
  }),
});
const missingIntensity = await request(
  `/api/web/films/${missingFilmId}/intensity`,
);
const missingMoments = await request(`/api/web/films/${missingFilmId}/moments`);
if (
  missingIntensity.buckets.length !== 2 ||
  missingIntensity.buckets.some(
    (bucket) =>
      bucket.intensityScore !== null ||
      bucket.dataStatus !== "insufficient-data",
  ) ||
  missingIntensity.summary.peakIntensity !== null ||
  missingIntensity.summary.dominantBand !== null ||
  missingIntensity.summary.sampleCoverage !== 0 ||
  missingMoments.moments.length !== 0
) {
  throw new Error(
    "Missing signals produced a score, calm band, or ranked moment.",
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      sessionId: session.id,
      filmId: normalizedFilmId,
      acceptedSamples: batch.acceptedSamples,
      bucketCount: intensity.buckets.length,
      momentCount: moments.moments.length,
      missingSignalBuckets: missingIntensity.buckets.length,
    },
    null,
    2,
  ),
);
