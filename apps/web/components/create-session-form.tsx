"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type FilmOption = {
  id: string;
  title: string;
  runtimeMinutes: number;
  releaseYear?: number;
};

type CreatedSession = {
  id: string;
  filmId: string;
  filmTitle: string;
  pairCode: string;
  startsAt: string;
  status: "created" | "paired" | "recording" | "uploading" | "complete";
  deviceModel?: string;
};

type State = {
  error: string | null;
  createdSession: CreatedSession | null;
};

export function CreateSessionForm({ films }: { films: FilmOption[] }) {
  const [state, setState] = useState<State>({ error: null, createdSession: null });
  const [filmOptions, setFilmOptions] = useState<FilmOption[]>([]);
  const [filmQuery, setFilmQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFilm, setSelectedFilm] = useState<FilmOption | null>(null);
  const recentFilms = films.slice(0, 4);
  const createdSession = state.createdSession;
  const watchHasPaired = createdSession
    ? createdSession.status !== "created" || Boolean(createdSession.deviceModel)
    : false;

  useEffect(() => {
    if (!createdSession || watchHasPaired) {
      return;
    }

    let cancelled = false;
    const sessionId = createdSession.id;

    async function pollSession() {
      try {
        const response = await fetch("/api/web/sessions", { cache: "no-store" });
        const payload = (await response.json()) as { sessions?: CreatedSession[] };
        const latest = payload.sessions?.find((session) => session.id === sessionId);

        if (!cancelled && latest) {
          setState((current) => ({
            ...current,
            createdSession: latest,
          }));
        }
      } catch {
        // Keep the visible created-session confirmation. The next poll can recover.
      }
    }

    const intervalId = window.setInterval(() => {
      void pollSession();
    }, 2500);
    void pollSession();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [createdSession, watchHasPaired]);

  async function searchFilms() {
    const query = filmQuery.trim();

    if (!query) {
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(`/api/web/films/search?q=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as { films?: FilmOption[]; error?: string };

      if (!response.ok || !payload.films) {
        setSearchError(payload.error ?? "Unable to search films.");
        return;
      }

      setFilmOptions(payload.films);
      setSelectedFilm(payload.films[0] ?? null);
      setSearchError(payload.films.length ? null : "No matching movies found.");
    } finally {
      setIsSearching(false);
    }
  }

  async function submit() {
    if (!selectedFilm) {
      setState({ createdSession: null, error: "Search for a movie and select a result first." });
      return;
    }

    const normalizedPairCode = pairCode.replace(/\s+/g, "").toUpperCase();

    setIsPending(true);

    try {
      const response = await fetch("/api/web/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filmId: selectedFilm.id,
          filmTitle: selectedFilm.title,
          runtimeMinutes: selectedFilm.runtimeMinutes,
          pairCode: normalizedPairCode,
          consentAccepted,
        }),
      });

      const payload = (await response.json()) as
        | { error?: string }
        | {
            session: CreatedSession;
          };

      if (!response.ok) {
        setState({
          createdSession: null,
          error: "error" in payload ? payload.error ?? "Unable to create a session." : "Unable to create a session.",
        });
        return;
      }

      if (!("session" in payload)) {
        setState({ error: "Session response was missing film metadata.", createdSession: null });
        return;
      }

      setState({ error: null, createdSession: payload.session });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="session-console">
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={isPending}
      >
        <fieldset>
          <legend>Film</legend>
          <div className="search-row">
            <label className="field-stack">
              <span>Search movie</span>
              <input
                name="filmSearch"
                onChange={(event) => {
                  setFilmQuery(event.currentTarget.value);
                  setSearchError(null);
                }}
                placeholder="Alien, Heat, Godzilla..."
                type="search"
                value={filmQuery}
              />
            </label>
            <button
              className="button button-secondary"
              disabled={isSearching || !filmQuery.trim()}
              onClick={() => {
                void searchFilms();
              }}
              type="button"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {selectedFilm ? (
            <div className="selected-film" aria-live="polite">
              <span>Selected</span>
              <strong>
                {selectedFilm.title}
                {selectedFilm.releaseYear ? ` (${selectedFilm.releaseYear})` : ""}
              </strong>
            </div>
          ) : null}

          {filmOptions.length ? (
            <ul className="search-results" aria-label="Movie search results">
              {filmOptions.map((film) => (
                <li key={film.id}>
                  <button
                    className={`search-result ${selectedFilm?.id === film.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedFilm(film)}
                    type="button"
                  >
                    <span>
                      <strong>{film.title}</strong>
                      {film.releaseYear ? <small>{film.releaseYear}</small> : null}
                    </span>
                    <span>{film.runtimeMinutes} min</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : recentFilms.length ? (
            <div className="recent-film-picker">
              <span>Recently used</span>
              <div className="recent-film-list">
                {recentFilms.map((film) => (
                  <button
                    className={`button button-secondary ${selectedFilm?.id === film.id ? "is-selected" : ""}`}
                    key={film.id}
                    onClick={() => setSelectedFilm(film)}
                    type="button"
                  >
                    {film.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {searchError ? (
            <p className="form-error" role="alert">
              {searchError}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend>Watch</legend>
          <label className="field-stack">
            <span>Code shown on your watch</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={12}
              minLength={6}
              name="pairCode"
              onChange={(event) => setPairCode(event.currentTarget.value)}
              placeholder="123456"
              value={pairCode}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Consent</legend>
          <label className="consent-row">
            <input
              checked={consentAccepted}
              name="consentAccepted"
              onChange={(event) => setConsentAccepted(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>I agree to upload watch biometrics for this screening.</span>
          </label>
        </fieldset>

        <button
          className="button-primary"
          disabled={
            isPending ||
            !selectedFilm ||
            !consentAccepted ||
            pairCode.replace(/\s+/g, "").length < 6
          }
          type="submit"
        >
          {isPending ? "Creating session..." : "Create watch session"}
        </button>

        {state.error ? (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        ) : null}
      </form>

      {state.createdSession ? (
        <div className="pairing-card" role="status">
          <div className="pairing-card__copy">
            <span className={`pill ${watchHasPaired ? "pill-success" : "pill-waiting"}`}>
              {watchHasPaired ? "Watch paired" : "Waiting for watch"}
            </span>
            <h3>{state.createdSession.filmTitle}</h3>
            <p>
              {watchHasPaired
                ? `${state.createdSession.deviceModel ?? "Garmin watch"} is ready. Confirm the title on the watch.`
                : "Keep the watch app open. It will confirm this code automatically."}
            </p>
          </div>

          <ol className="watch-steps">
            <li>Confirm the film title appears on the watch.</li>
            <li>Press SELECT when the movie starts.</li>
            <li>Press SELECT after the credits to stop and upload.</li>
          </ol>

          <div className="pairing-actions">
            <Link className="button button-secondary" href={`/films/${state.createdSession.filmId}`}>
              View results page
            </Link>
            <button
              className="button button-secondary"
              onClick={() => {
                setState({ error: null, createdSession: null });
                setConsentAccepted(false);
              }}
              type="button"
            >
              Start another session
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
