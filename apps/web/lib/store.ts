import { promises as fs } from "node:fs";
import path from "node:path";

import { createSqlClient } from "@film-intensity/db";
import {
  type BiometricSample,
  type CreateFilmSessionRequest,
  type DeviceCapabilities,
  type FilmCatalogEntry,
  type FilmIntensityBucket,
  type FilmIntensitySummary,
  type IntenseMoment,
  type PairDeviceRequest,
  type SessionBatch,
  type SessionComplete,
  type SessionStart,
  type SessionStatus,
  bucketizeSamples,
  extractIntenseMoments,
  hasIntensityScore,
  summarizeBuckets,
} from "@film-intensity/shared";

import { generateId, generatePairCode } from "./utils";
import { newSamplesForBatch, SessionUploadConflict } from "./session-upload";

export type FilmRecord = FilmCatalogEntry & {
  watchFit: string;
  peakWindowHint: string;
};

export type SessionRecord = {
  id: string;
  filmId: string;
  filmTitle: string;
  runtimeMinutes: number;
  userId: string;
  pairCode: string;
  status: SessionStatus;
  startsAt: string;
  createdAt: string;
  completedAt?: string;
  deviceId?: string;
  deviceModel?: string;
  deviceToken?: string;
  capabilities: DeviceCapabilities;
  samples: BiometricSample[];
};

type FilmStore = {
  films: FilmRecord[];
  sessions: SessionRecord[];
};

export type FeaturedFilm = FilmRecord & {
  summary: FilmIntensitySummary;
  completedViewerCount: number;
  liveSessionCount: number;
  intenseMoments: IntenseMoment[];
};

export type DashboardSnapshot = {
  totalFilms: number;
  completedSessions: number;
  liveSessions: number;
  pairedDevices: number;
  mostIntenseFilmId: string;
  averagePeakIntensity: number | null;
};

const STORE_PATH = path.join(process.cwd(), "data", "store.json");
const POSTGRES_STORE_ID = "default";

declare global {
  var __filmIntensityStoreCache: FilmStore | undefined;
}

async function ensurePostgresStore(sql: ReturnType<typeof createSqlClient>) {
  const existing = await sql<{ store: string | null }[]>`
    select to_regclass('public.film_intensity_store')::text as store
  `;

  if (existing[0]?.store) {
    return;
  }

  try {
    await sql`
      create table if not exists film_intensity_store (
        id text primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      )
    `;
  } catch (error) {
    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "42P07"
      )
    ) {
      throw error;
    }
  }
}

function aggregateBuckets(sessions: SessionRecord[]): FilmIntensityBucket[] {
  const grouped = new Map<number, FilmIntensityBucket[]>();

  for (const session of sessions) {
    for (const bucket of bucketizeSamples(session.samples)) {
      const values = grouped.get(bucket.bucketStartMs) ?? [];
      values.push(bucket);
      grouped.set(bucket.bucketStartMs, values);
    }
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([bucketStartMs, buckets]) => {
      const averageAvailable = (values: Array<number | null>) => {
        const present = values.filter(
          (value): value is number => value !== null && Number.isFinite(value),
        );
        return present.length
          ? Math.round(
              present.reduce((sum, value) => sum + value / present.length, 0),
            )
          : null;
      };
      const scored = buckets.filter(hasIntensityScore);
      return {
        bucketStartMs,
        sampleCount: buckets.reduce(
          (sum, bucket) => sum + bucket.sampleCount,
          0,
        ),
        usableSampleCount: buckets.reduce(
          (sum, bucket) => sum + (bucket.usableSampleCount ?? 0),
          0,
        ),
        dataStatus: scored.length
          ? ("available" as const)
          : ("insufficient-data" as const),
        averageHeartRateBpm: averageAvailable(
          buckets.map((bucket) => bucket.averageHeartRateBpm),
        ),
        averageStressLevel: averageAvailable(
          buckets.map((bucket) => bucket.averageStressLevel),
        ),
        averageHrvRmssd: averageAvailable(
          buckets.map((bucket) => bucket.averageHrvRmssd),
        ),
        intensityScore: averageAvailable(
          scored.map((bucket) => bucket.intensityScore),
        ),
      };
    });
}

async function persistStore(store: FilmStore) {
  if (process.env.DATABASE_URL) {
    const sql = createSqlClient();

    try {
      await ensurePostgresStore(sql);
      await sql`
        insert into film_intensity_store (id, data, updated_at)
        values (${POSTGRES_STORE_ID}, ${sql.json(store)}, now())
        on conflict (id) do update
        set data = excluded.data,
            updated_at = excluded.updated_at
      `;
    } finally {
      await sql.end();
    }

    globalThis.__filmIntensityStoreCache = store;
    return;
  }

  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
  globalThis.__filmIntensityStoreCache = store;
}

async function readStore(): Promise<FilmStore> {
  if (globalThis.__filmIntensityStoreCache) {
    return globalThis.__filmIntensityStoreCache;
  }

  if (process.env.DATABASE_URL) {
    const sql = createSqlClient();

    try {
      await ensurePostgresStore(sql);

      const rows = await sql<{ data: FilmStore }[]>`
        select data
        from film_intensity_store
        where id = ${POSTGRES_STORE_ID}
        limit 1
      `;

      if (rows[0]?.data) {
        globalThis.__filmIntensityStoreCache = rows[0].data;
        return rows[0].data;
      }
    } finally {
      await sql.end();
    }

    const emptyStore = { films: [], sessions: [] };
    await persistStore(emptyStore);
    return emptyStore;
  }

  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as FilmStore;
    globalThis.__filmIntensityStoreCache = parsed;
    return parsed;
  } catch {
    const emptyStore = { films: [], sessions: [] };
    await persistStore(emptyStore);
    return emptyStore;
  }
}

function getCompletedSessionsForFilm(store: FilmStore, filmId: string) {
  return store.sessions.filter(
    (session) => session.filmId === filmId && session.status === "complete",
  );
}

export async function listFilms() {
  const store = await readStore();
  return store.films;
}

export async function listSessions() {
  const store = await readStore();
  return store.sessions;
}

export async function getSessionById(sessionId: string) {
  const store = await readStore();
  return store.sessions.find((session) => session.id === sessionId) ?? null;
}

export async function listLiveSessions() {
  const store = await readStore();
  return store.sessions.filter((session) => session.status !== "complete");
}

export async function getFilmById(filmId: string) {
  const store = await readStore();
  return store.films.find((film) => film.id === filmId) ?? null;
}

export async function createSession(input: CreateFilmSessionRequest) {
  const store = await readStore();
  const filmId =
    input.filmId.startsWith("tmdb-") || input.filmId.startsWith("manual-")
      ? input.filmId
      : `tmdb-${input.filmId}`;
  const existingFilm = store.films.find((film) => film.id === filmId);

  if (!existingFilm) {
    store.films.push({
      id: filmId,
      title: input.filmTitle,
      runtimeMinutes: input.runtimeMinutes,
      director: "Unknown",
      logline: "Intensity data appears after completed watch screenings.",
      tone: "Awaiting audience biometric captures.",
      watchFit: "Use a paired Garmin watch with heart-rate capture enabled.",
      peakWindowHint: "No completed screenings yet.",
    });
  }

  const session: SessionRecord = {
    id: generateId("session"),
    filmId,
    filmTitle: input.filmTitle,
    runtimeMinutes: input.runtimeMinutes,
    userId: "local_user",
    pairCode: input.pairCode?.trim().toUpperCase() ?? generatePairCode(),
    status: "created",
    startsAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    capabilities: {
      heartRate: true,
      stress: true,
      hrv: false,
    },
    samples: [],
  };

  store.sessions.unshift(session);
  await persistStore(store);
  return session;
}

export async function pairDevice(input: PairDeviceRequest) {
  const store = await readStore();
  const session = store.sessions.find(
    (candidate) =>
      candidate.pairCode === input.pairCode && candidate.status !== "complete",
  );

  if (!session) {
    return null;
  }

  session.deviceId = input.deviceId;
  session.deviceModel = input.deviceModel;
  session.deviceToken = `${input.deviceId}_${Math.random().toString(36).slice(2, 20)}`;
  session.status = "paired";
  await persistStore(store);

  return session;
}

export async function getActiveSession(
  deviceId?: string,
  deviceToken?: string,
) {
  const store = await readStore();

  return store.sessions.find((session) => {
    if (session.status === "complete") {
      return false;
    }

    if (deviceToken) {
      return session.deviceToken === deviceToken;
    }

    if (deviceId) {
      return session.deviceId === deviceId;
    }

    return false;
  });
}

export async function appendSamples(input: SessionBatch) {
  const store = await readStore();
  const session = store.sessions.find(
    (candidate) =>
      candidate.id === input.sessionId &&
      candidate.deviceId === input.deviceId &&
      candidate.deviceToken === input.deviceToken,
  );

  if (!session) {
    return null;
  }

  const additions = newSamplesForBatch(
    session.samples,
    input.samples,
    session.status === "complete",
  );
  if (additions.length > 0) {
    session.samples.push(...additions);
    session.status = "uploading";
  }
  // A previous attempt may have updated the process cache before its write
  // failed. Re-persist even a replay before acknowledging it as received.
  await persistStore(store);

  return session;
}

export async function startSession(input: SessionStart) {
  const store = await readStore();
  const session = store.sessions.find(
    (candidate) =>
      candidate.id === input.sessionId &&
      candidate.deviceId === input.deviceId &&
      candidate.deviceToken === input.deviceToken,
  );

  if (!session || session.status === "complete") {
    return null;
  }

  session.status = "recording";
  await persistStore(store);

  return session;
}

export async function completeSession(input: SessionComplete) {
  const store = await readStore();
  const session = store.sessions.find(
    (candidate) =>
      candidate.id === input.sessionId &&
      candidate.deviceId === input.deviceId &&
      candidate.deviceToken === input.deviceToken,
  );

  if (!session) {
    return null;
  }

  if (input.totalSamples !== session.samples.length) {
    throw new SessionUploadConflict(
      "Completion sample count does not match received samples.",
    );
  }

  // Retries can carry a later timestamp or different detected capabilities after
  // a watch restart. Keep the first accepted completion metadata unchanged.
  if (session.status === "complete") {
    await persistStore(store);
    return session;
  }

  session.status = "complete";
  session.capabilities = input.capabilities;
  session.completedAt = input.completedAt;
  await persistStore(store);

  return session;
}

export async function getFilmBuckets(
  filmId: string,
): Promise<FilmIntensityBucket[]> {
  const store = await readStore();

  const relevantSessions = getCompletedSessionsForFilm(store, filmId);

  if (!relevantSessions.length) {
    return [];
  }

  return aggregateBuckets(relevantSessions);
}

export async function getFilmMoments(filmId: string): Promise<IntenseMoment[]> {
  const buckets = await getFilmBuckets(filmId);

  return extractIntenseMoments(buckets, 5);
}

export async function getFilmSummary(
  filmId: string,
): Promise<FilmIntensitySummary> {
  const buckets = await getFilmBuckets(filmId);

  return summarizeBuckets(buckets);
}

export async function getFeaturedFilms(): Promise<FeaturedFilm[]> {
  const [films, sessions] = await Promise.all([listFilms(), listSessions()]);

  const featured = await Promise.all(
    films.map(async (film) => ({
      ...film,
      summary: await getFilmSummary(film.id),
      completedViewerCount: sessions.filter(
        (session) =>
          session.filmId === film.id && session.status === "complete",
      ).length,
      liveSessionCount: sessions.filter(
        (session) =>
          session.filmId === film.id && session.status !== "complete",
      ).length,
      intenseMoments: await getFilmMoments(film.id),
    })),
  );

  return featured.sort(
    (left, right) =>
      (right.summary.peakIntensity ?? -1) - (left.summary.peakIntensity ?? -1),
  );
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [featured, sessions, liveSessions, films] = await Promise.all([
    getFeaturedFilms(),
    listSessions(),
    listLiveSessions(),
    listFilms(),
  ]);

  const completedSessions = sessions.filter(
    (session) => session.status === "complete",
  );
  const scoredFilms = featured.filter(
    (film) => film.summary.peakIntensity !== null,
  );

  return {
    totalFilms: films.length,
    completedSessions: completedSessions.length,
    liveSessions: liveSessions.length,
    pairedDevices: sessions.filter((session) => session.deviceId).length,
    mostIntenseFilmId: scoredFilms[0]?.id ?? "",
    averagePeakIntensity:
      scoredFilms.length > 0
        ? Math.round(
            scoredFilms.reduce(
              (sum, film) => sum + (film.summary.peakIntensity as number),
              0,
            ) / scoredFilms.length,
          )
        : null,
  };
}
