import { z } from "zod";

export const schemaVersion = 1;
// Read-result shape only; device ingestion remains schemaVersion 1.
export const intensityReadSchemaVersion = 2;
export const dataStatusSchema = z.enum(["available", "insufficient-data"]);

// Connect IQ sends epoch milliseconds; browser clients already send ISO strings.
// Bound numeric input before conversion so safeParse never throws a RangeError.
const deviceDateTimeSchema = z.union([
  z.string().datetime(),
  z
    .number()
    .int()
    .min(0)
    .max(8_640_000_000_000_000)
    .transform((value) => new Date(value).toISOString()),
]);
export const sessionStatusSchema = z.enum([
  "created",
  "paired",
  "recording",
  "uploading",
  "complete",
]);

export const deviceCapabilitiesSchema = z.object({
  heartRate: z.boolean(),
  stress: z.boolean(),
  hrv: z.boolean(),
});

export const filmCatalogEntrySchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  runtimeMinutes: z.number().int().positive(),
  releaseYear: z.number().int().optional(),
  director: z.string().min(1),
  logline: z.string().min(1),
  tone: z.string().min(1),
});

export const biometricSampleSchema = z.object({
  timestamp: z.union([z.string().datetime(), z.number().int().min(0)]),
  elapsedMs: z.number().int().min(0),
  heartRateBpm: z.number().int().min(0).nullable(),
  stressLevel: z.number().min(0).max(100).nullable(),
  hrvRmssd: z.number().min(0).nullable(),
  heartBeatIntervalsMs: z.array(z.number().positive()).default([]),
});

export const pairDeviceRequestSchema = z.object({
  pairCode: z.string().trim().min(6).max(12),
  deviceId: z.string().trim().min(1),
  deviceModel: z.string().trim().min(1),
  appVersion: z.string().trim().min(1),
});

export const pairDeviceResponseSchema = z.object({
  deviceToken: z.string().min(16),
  userId: z.string(),
  activeSessionId: z.string().nullable(),
});

export const deviceSessionSchema = z.object({
  id: z.string(),
  filmId: z.string(),
  filmTitle: z.string().min(1),
  runtimeMinutes: z.number().int().positive(),
  pairCode: z.string().trim().min(6).max(12),
  startsAt: z.string().datetime(),
  status: sessionStatusSchema,
  capabilities: deviceCapabilitiesSchema,
});

export const activeDeviceSessionResponseSchema = z.object({
  session: deviceSessionSchema.nullable(),
});

export const createFilmSessionRequestSchema = z.object({
  filmId: z.string(),
  filmTitle: z.string().min(1),
  runtimeMinutes: z.number().int().positive(),
  pairCode: z.string().trim().min(6).max(12).optional(),
  consentAccepted: z.boolean(),
});

export const createFilmSessionResponseSchema = z.object({
  sessionId: z.string(),
  pairCode: z.string(),
  startsAt: z.string().datetime(),
});

export const sessionBatchSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  sessionId: z.string(),
  deviceId: z.string(),
  deviceToken: z.string(),
  samples: z.array(biometricSampleSchema).min(1),
});

export const sessionStartSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  sessionId: z.string(),
  deviceId: z.string(),
  deviceToken: z.string(),
  startedAt: deviceDateTimeSchema,
});

export const sessionCompleteSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  sessionId: z.string(),
  deviceId: z.string(),
  deviceToken: z.string(),
  completedAt: deviceDateTimeSchema,
  totalSamples: z.number().int().min(0),
  capabilities: deviceCapabilitiesSchema,
});

export const filmIntensityBucketSchema = z.object({
  bucketStartMs: z.number().int().min(0),
  sampleCount: z.number().int().min(0),
  averageHeartRateBpm: z.number().min(0).nullable(),
  averageStressLevel: z.number().min(0).max(100).nullable(),
  averageHrvRmssd: z.number().min(0).nullable(),
  intensityScore: z.number().min(0).max(100).nullable(),
  dataStatus: dataStatusSchema.optional(),
  usableSampleCount: z.number().int().min(0).optional(),
});

export const intenseMomentSchema = z.object({
  bucketStartMs: z.number().int().min(0),
  label: z.string(),
  intensityScore: z.number().min(0).max(100),
  viewerCount: z.number().int().min(0),
});

export const filmIntensitySummarySchema = z.object({
  averageIntensity: z.number().min(0).max(100).nullable(),
  peakIntensity: z.number().min(0).max(100).nullable(),
  dominantBand: z.enum(["calm", "rising", "spike", "overdrive"]).nullable(),
  dataStatus: dataStatusSchema.optional(),
  totalSampleCount: z.number().int().min(0).optional(),
  usableSampleCount: z.number().int().min(0).nullable().optional(),
  sampleCoverage: z.number().min(0).max(1).nullable().optional(),
});

export type BiometricSample = z.infer<typeof biometricSampleSchema>;
export type DeviceCapabilities = z.infer<typeof deviceCapabilitiesSchema>;
export type FilmCatalogEntry = z.infer<typeof filmCatalogEntrySchema>;
export type PairDeviceRequest = z.infer<typeof pairDeviceRequestSchema>;
export type PairDeviceResponse = z.infer<typeof pairDeviceResponseSchema>;
export type DeviceSession = z.infer<typeof deviceSessionSchema>;
export type ActiveDeviceSessionResponse = z.infer<
  typeof activeDeviceSessionResponseSchema
>;
export type CreateFilmSessionRequest = z.infer<
  typeof createFilmSessionRequestSchema
>;
export type CreateFilmSessionResponse = z.infer<
  typeof createFilmSessionResponseSchema
>;
export type SessionBatch = z.infer<typeof sessionBatchSchema>;
export type SessionStart = z.infer<typeof sessionStartSchema>;
export type SessionComplete = z.infer<typeof sessionCompleteSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type FilmIntensityBucket = z.infer<typeof filmIntensityBucketSchema>;
export type IntenseMoment = z.infer<typeof intenseMomentSchema>;
export type FilmIntensitySummary = z.infer<typeof filmIntensitySummarySchema>;
