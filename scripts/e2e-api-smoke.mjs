const baseUrl = process.env.FILM_INTENSITY_BASE_URL ?? "http://localhost:3000";
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const pairCode = `E2E${runId.slice(-6).toUpperCase()}`.slice(0, 9);
const deviceId = `e2e-device-${runId}`;
const filmId = `e2e-film-${runId}`;
const filmTitle = `E2E Screening ${runId}`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed with ${response.status}: ${text}`);
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
  throw new Error("Session creation did not return the expected id and pair code.");
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
  throw new Error("Pairing did not return the expected device token and active session id.");
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
    startedAt: new Date().toISOString(),
  }),
});

if (started.status !== "recording") {
  throw new Error("Session start did not mark the session recording.");
}

const batch = await request("/api/device/session-batch", {
  method: "POST",
  body: JSON.stringify({
    schemaVersion: 1,
    sessionId: session.id,
    deviceId,
    deviceToken: paired.deviceToken,
    samples: [
      sample(0, 72, 18, 61),
      sample(15_000, 86, 34, 53),
      sample(30_000, 104, 72, 39),
      sample(45_000, 98, 68, 42),
    ],
  }),
});

if (batch.acceptedSamples !== 4 || batch.totalSamples < 4) {
  throw new Error("Batch upload did not accept the expected samples.");
}

const completed = await request("/api/device/session-complete", {
  method: "POST",
  body: JSON.stringify({
    schemaVersion: 1,
    sessionId: session.id,
    deviceId,
    deviceToken: paired.deviceToken,
    completedAt: new Date().toISOString(),
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

const normalizedFilmId = filmId.startsWith("tmdb-") ? filmId : `tmdb-${filmId}`;
const intensity = await request(`/api/web/films/${encodeURIComponent(normalizedFilmId)}/intensity`);
const moments = await request(`/api/web/films/${encodeURIComponent(normalizedFilmId)}/moments`);

if (!Array.isArray(intensity.buckets) || intensity.buckets.length === 0) {
  throw new Error("Intensity endpoint returned no buckets after completion.");
}

if (!Array.isArray(moments.moments) || moments.moments.length === 0) {
  throw new Error("Moments endpoint returned no moments after completion.");
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
    },
    null,
    2,
  ),
);
