import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const consents = pgTable("consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  policyVersion: integer("policy_version").notNull().default(1),
});

export const films = pgTable("films", {
  id: uuid("id").defaultRandom().primaryKey(),
  tmdbId: varchar("tmdb_id", { length: 64 }).notNull(),
  title: text("title").notNull(),
  runtimeMinutes: integer("runtime_minutes").notNull(),
  releaseYear: integer("release_year"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const devicePairs = pgTable(
  "device_pairs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    deviceModel: varchar("device_model", { length: 128 }).notNull(),
    deviceToken: varchar("device_token", { length: 128 }).notNull(),
    pairCode: varchar("pair_code", { length: 12 }).notNull(),
    pairedAt: timestamp("paired_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    deviceTokenIndex: uniqueIndex("device_pairs_device_token_idx").on(table.deviceToken),
  }),
);

export const filmSessions = pgTable("film_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  filmId: uuid("film_id").notNull(),
  devicePairId: uuid("device_pair_id"),
  status: varchar("status", { length: 32 }).notNull().default("created"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  capabilities: jsonb("capabilities")
    .$type<{ heartRate: boolean; stress: boolean; hrv: boolean }>()
    .notNull()
    .default({ heartRate: true, stress: true, hrv: false }),
});

export const biometricSamples = pgTable("biometric_samples", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
  elapsedMs: integer("elapsed_ms").notNull(),
  heartRateBpm: integer("heart_rate_bpm"),
  stressLevel: integer("stress_level"),
  hrvRmssd: integer("hrv_rmssd"),
  rawBeatIntervalsMs: jsonb("raw_beat_intervals_ms").$type<number[]>().notNull().default([]),
});

export const filmIntensityAggregates = pgTable("film_intensity_aggregates", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id").notNull(),
  bucketStartMs: integer("bucket_start_ms").notNull(),
  viewerCount: integer("viewer_count").notNull().default(0),
  averageHeartRateBpm: integer("average_heart_rate_bpm"),
  averageStressLevel: integer("average_stress_level"),
  averageHrvRmssd: integer("average_hrv_rmssd"),
  intensityScore: integer("intensity_score").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deletionRequests = pgTable("deletion_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  completed: boolean("completed").notNull().default(false),
});
