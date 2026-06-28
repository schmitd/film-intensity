type MovieSearchResult = {
  id: string;
  title: string;
  runtimeMinutes: number;
  releaseYear?: number;
};

export type MarketFilm = MovieSearchResult & {
  source: "tmdb-trending" | "tmdb-now-playing";
  signalLabel: string;
  crowdHeat: number;
  logline: string;
};

type TmdbMovie = {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
};

function mapTmdbMovie(movie: TmdbMovie, source: MarketFilm["source"], index: number): MarketFilm {
  const releaseDate = movie.release_date ?? movie.first_air_date;
  const voteHeat = Math.round((movie.vote_average ?? 0) * 10);
  const popularityHeat = Math.min(100, Math.round((movie.popularity ?? 0) / 8));

  return {
    id: `tmdb-${movie.id}`,
    title: movie.title ?? movie.name ?? "Untitled event film",
    runtimeMinutes: 120,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : undefined,
    source,
    signalLabel:
      source === "tmdb-now-playing"
        ? index < 3
          ? "opening-week energy"
          : "in theaters"
        : index < 3
          ? "social spike"
          : "trending",
    crowdHeat: Math.max(voteHeat, popularityHeat, 42),
    logline: movie.overview?.trim() || "Current audience momentum candidate for a live intensity run.",
  };
}

export async function searchMovies(query: string): Promise<MovieSearchResult[]> {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    throw new Error("TMDB_API_KEY is required for movie search.");
  }

  if (!query.trim()) {
    return [];
  }

  const searchResponse = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`,
    { next: { revalidate: 86_400 } },
  );

  if (!searchResponse.ok) {
    return [];
  }

  const searchPayload = (await searchResponse.json()) as {
    results?: Array<{ id: number; title: string; release_date?: string }>;
  };

  const candidates = (searchPayload.results ?? []).slice(0, 8);
  const details = await Promise.allSettled(
    candidates.map(async (movie) => {
      const detailResponse = await fetch(
        `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${apiKey}`,
        { next: { revalidate: 604_800 } },
      );
      const detail = detailResponse.ok
        ? ((await detailResponse.json()) as { runtime?: number | null })
        : {};

      return {
        id: `tmdb-${movie.id}`,
        title: movie.title,
        runtimeMinutes: detail.runtime && detail.runtime > 0 ? detail.runtime : 120,
        releaseYear: movie.release_date ? Number(movie.release_date.slice(0, 4)) : undefined,
      };
    }),
  );

  return details.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function getMarketSlate(): Promise<MarketFilm[]> {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return [];
  }

  const endpoints: Array<{ url: string; source: MarketFilm["source"] }> = [
    {
      url: `https://api.themoviedb.org/3/movie/now_playing?api_key=${apiKey}&language=en-US&page=1&region=US`,
      source: "tmdb-now-playing",
    },
    {
      url: `https://api.themoviedb.org/3/trending/all/day?api_key=${apiKey}&language=en-US`,
      source: "tmdb-trending",
    },
  ];

  const payloads = await Promise.allSettled(
    endpoints.map(async ({ url, source }) => {
      const response = await fetch(url, { next: { revalidate: 21_600 } });

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as { results?: TmdbMovie[] };
      return (payload.results ?? [])
        .filter((movie) => source === "tmdb-now-playing" || movie.media_type === "movie")
        .slice(0, 6)
        .map((movie, index) => mapTmdbMovie(movie, source, index));
    }),
  );

  const marketFilms = payloads.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const unique = new Map<string, MarketFilm>();

  for (const film of marketFilms) {
    if (!unique.has(film.id)) {
      unique.set(film.id, film);
    }
  }

  return Array.from(unique.values()).slice(0, 8);
}
