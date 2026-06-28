import type { BiometricSample, FilmCatalogEntry } from "./contracts";
import { bucketizeSamples, extractIntenseMoments, summarizeBuckets } from "./scoring";

export const demoSamples: BiometricSample[] = [
  { timestamp: "2026-04-05T22:00:00.000Z", elapsedMs: 0, heartRateBpm: 74, stressLevel: 18, hrvRmssd: 48, heartBeatIntervalsMs: [810, 804, 820] },
  { timestamp: "2026-04-05T22:00:05.000Z", elapsedMs: 5_000, heartRateBpm: 76, stressLevel: 20, hrvRmssd: 45, heartBeatIntervalsMs: [790, 784, 788] },
  { timestamp: "2026-04-05T22:24:55.000Z", elapsedMs: 1_495_000, heartRateBpm: 92, stressLevel: 47, hrvRmssd: 28, heartBeatIntervalsMs: [645, 650, 640] },
  { timestamp: "2026-04-05T22:25:00.000Z", elapsedMs: 1_500_000, heartRateBpm: 99, stressLevel: 56, hrvRmssd: 24, heartBeatIntervalsMs: [610, 600, 618] },
  { timestamp: "2026-04-05T22:25:05.000Z", elapsedMs: 1_505_000, heartRateBpm: 101, stressLevel: 61, hrvRmssd: 22, heartBeatIntervalsMs: [598, 605, 590] },
  { timestamp: "2026-04-05T22:54:55.000Z", elapsedMs: 3_295_000, heartRateBpm: 110, stressLevel: 70, hrvRmssd: 16, heartBeatIntervalsMs: [550, 544, 548] },
  { timestamp: "2026-04-05T22:55:00.000Z", elapsedMs: 3_300_000, heartRateBpm: 116, stressLevel: 76, hrvRmssd: 14, heartBeatIntervalsMs: [520, 530, 526] },
  { timestamp: "2026-04-05T22:55:05.000Z", elapsedMs: 3_305_000, heartRateBpm: 119, stressLevel: 79, hrvRmssd: 13, heartBeatIntervalsMs: [510, 514, 506] },
];

export const demoFilm: FilmCatalogEntry = {
  id: "tmdb-603",
  title: "The Matrix",
  runtimeMinutes: 136,
  releaseYear: 1999,
  director: "Lana Wachowski, Lilly Wachowski",
  logline: "A hacker learns reality is engineered and every answer comes with escalating consequence.",
  tone: "Cold control broken by sudden velocity.",
};

export const demoFilms: FilmCatalogEntry[] = [
  demoFilm,
  {
    id: "tmdb-157336",
    title: "Interstellar",
    runtimeMinutes: 169,
    releaseYear: 2014,
    director: "Christopher Nolan",
    logline: "A father crosses impossible distance while time keeps taking pieces of home away from him.",
    tone: "Slow-burn awe with catastrophic emotional peaks.",
  },
  {
    id: "tmdb-335984",
    title: "Blade Runner 2049",
    runtimeMinutes: 164,
    releaseYear: 2017,
    director: "Denis Villeneuve",
    logline: "A controlled investigation turns into a search for meaning in a world designed to erase it.",
    tone: "Hypnotic tension punctured by hard shock moments.",
  },
  {
    id: "tmdb-693134",
    title: "Dune: Part Two",
    runtimeMinutes: 166,
    releaseYear: 2024,
    director: "Denis Villeneuve",
    logline: "A messianic war machine gathers force across the desert.",
    tone: "Ceremonial dread with massive escalation.",
  },
  {
    id: "tmdb-76341",
    title: "Mad Max: Fury Road",
    runtimeMinutes: 121,
    releaseYear: 2015,
    director: "George Miller",
    logline: "A desert chase turns survival into a full-body endurance test.",
    tone: "Relentless kinetic pressure.",
  },
  {
    id: "tmdb-578",
    title: "Jaws",
    runtimeMinutes: 124,
    releaseYear: 1975,
    director: "Steven Spielberg",
    logline: "A beach town tries to deny the shape moving beneath the water.",
    tone: "Slow dread punctured by clean shock.",
  },
  {
    id: "tmdb-329",
    title: "Jurassic Park",
    runtimeMinutes: 127,
    releaseYear: 1993,
    director: "Steven Spielberg",
    logline: "A theme park preview becomes a creature-feature stress test.",
    tone: "Wonder turning into panic.",
  },
  {
    id: "tmdb-361743",
    title: "Top Gun: Maverick",
    runtimeMinutes: 131,
    releaseYear: 2022,
    director: "Joseph Kosinski",
    logline: "A flight team trains for a mission with no room for hesitation.",
    tone: "Clean adrenaline and release.",
  },
  {
    id: "tmdb-872585",
    title: "Oppenheimer",
    runtimeMinutes: 181,
    releaseYear: 2023,
    director: "Christopher Nolan",
    logline: "A scientific triumph collapses into moral consequence.",
    tone: "Talk-driven dread with seismic peaks.",
  },
];

export const demoBuckets = bucketizeSamples(demoSamples);
export const demoMoments = extractIntenseMoments(demoBuckets);
export const demoSummary = summarizeBuckets(demoBuckets);
