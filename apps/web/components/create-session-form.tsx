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

const SETUP_SESSION_POLL_INTERVAL_MS = 15_000;
const RECORDING_SESSION_POLL_INTERVAL_MS = 90_000;
const UPLOADING_SESSION_POLL_INTERVAL_MS = 15_000;
const HIDDEN_TAB_POLL_INTERVAL_MS = 120_000;
const MAX_SESSION_POLL_MS = 4 * 60 * 60 * 1000;
const SESSION_STATUS_ORDER: CreatedSession["status"][] = [
  "created",
  "paired",
  "recording",
  "uploading",
  "complete",
];
const SESSION_STATUS_LABEL: Record<CreatedSession["status"], string> = {
  created: "Waiting for watch",
  paired: "Watch paired",
  recording: "Recording",
  uploading: "Uploading",
  complete: "Complete",
};
const SESSION_STATUS_DETAIL: Record<CreatedSession["status"], string> = {
  created: "Keep the watch app open. It will confirm this code automatically.",
  paired: "Confirm the title on the watch and press SELECT when the movie starts.",
  recording: "The watch is capturing live biometric samples for this screening.",
  uploading: "The watch is sending samples. Keep it nearby until this completes.",
  complete: "The screening is ready to review on the results page.",
};

function slugifyFilmTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSessionPollInterval(status: CreatedSession["status"]) {
  if (document.hidden) {
    return HIDDEN_TAB_POLL_INTERVAL_MS;
  }

  if (status === "recording") {
    return RECORDING_SESSION_POLL_INTERVAL_MS;
  }

  if (status === "uploading") {
    return UPLOADING_SESSION_POLL_INTERVAL_MS;
  }

  return SETUP_SESSION_POLL_INTERVAL_MS;
}

export function CreateSessionForm({ films }: { films: FilmOption[] }) {
  const [state, setState] = useState<State>({ error: null, createdSession: null });
  const [filmOptions, setFilmOptions] = useState<FilmOption[]>([]);
  const [filmQuery, setFilmQuery] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualRuntimeMinutes, setManualRuntimeMinutes] = useState("");
  const [isManualEntry, setIsManualEntry] = useState(false);
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
  const manualRuntime = Number.parseInt(manualRuntimeMinutes, 10);
  const manualSlug = slugifyFilmTitle(manualTitle);
  const manualFilm =
    isManualEntry && manualSlug && Number.isInteger(manualRuntime) && manualRuntime > 0
      ? {
          id: `manual-${manualSlug}`,
          title: manualTitle.trim(),
          runtimeMinutes: manualRuntime,
        }
      : null;
  const filmForSession = isManualEntry ? manualFilm : selectedFilm;

  useEffect(() => {
    if (!createdSession || createdSession.status === "complete") {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    let controller: AbortController | undefined;
    let reachedTerminalState = false;
    const startedAt = Date.now();
    const sessionId = createdSession.id;
    const initialStatus = createdSession.status;

    async function pollSession() {
      if (cancelled) {
        return;
      }

      if (Date.now() - startedAt > MAX_SESSION_POLL_MS) {
        return;
      }

      controller = new AbortController();
      let nextPollStatus: CreatedSession["status"] = initialStatus;

      try {
        const response = await fetch(`/api/web/sessions/${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { session?: CreatedSession };
        const latest = payload.session;

        if (!cancelled && latest) {
          reachedTerminalState = latest.status === "complete";
          nextPollStatus = latest.status;
          setState((current) => ({
            ...current,
            createdSession:
              current.createdSession?.status === latest.status &&
              current.createdSession.deviceModel === latest.deviceModel
                ? current.createdSession
                : latest,
          }));
        }
      } catch {
        // Keep the visible created-session confirmation. The next poll can recover.
      } finally {
        controller = undefined;

        if (!cancelled && !reachedTerminalState && Date.now() - startedAt <= MAX_SESSION_POLL_MS) {
          timeoutId = window.setTimeout(
            () => {
              void pollSession();
            },
            getSessionPollInterval(nextPollStatus),
          );
        }
      }
    }

    void pollSession();

    return () => {
      cancelled = true;
      controller?.abort();

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [createdSession?.id, createdSession?.status]);

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
        setSearchError("Movie search is unavailable. Enter the film manually to continue.");
        return;
      }

      setFilmOptions(payload.films);
      setIsManualEntry(false);
      setSelectedFilm(payload.films[0] ?? null);
      setSearchError(payload.films.length ? null : "No matching movies found. Enter the title manually.");
    } catch {
      setSearchError("Movie search is unavailable. Enter the film manually to continue.");
    } finally {
      setIsSearching(false);
    }
  }

  async function submit() {
    if (!filmForSession) {
      setState({
        createdSession: null,
        error: isManualEntry
          ? "Enter a film title and runtime before creating a session."
          : "Search for a movie and select a result first.",
      });
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
          filmId: filmForSession.id,
          filmTitle: filmForSession.title,
          runtimeMinutes: filmForSession.runtimeMinutes,
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

          {selectedFilm && !isManualEntry ? (
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
                    onClick={() => {
                      setIsManualEntry(false);
                      setSelectedFilm(film);
                    }}
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
                    onClick={() => {
                      setIsManualEntry(false);
                      setSelectedFilm(film);
                    }}
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

          <div className="manual-film-panel">
            <button
              className="button button-secondary"
              onClick={() => {
                setIsManualEntry((current) => !current);
                setSearchError(null);
                if (!manualTitle && filmQuery.trim()) {
                  setManualTitle(filmQuery.trim());
                }
              }}
              type="button"
            >
              {isManualEntry ? "Use movie search" : "Enter film manually"}
            </button>

            {isManualEntry ? (
              <div className="manual-film-fields">
                <label className="field-stack">
                  <span>Film title</span>
                  <input
                    name="manualTitle"
                    onChange={(event) => setManualTitle(event.currentTarget.value)}
                    placeholder="Film title"
                    value={manualTitle}
                  />
                </label>
                <label className="field-stack">
                  <span>Runtime minutes</span>
                  <input
                    inputMode="numeric"
                    min={1}
                    name="manualRuntimeMinutes"
                    onChange={(event) => setManualRuntimeMinutes(event.currentTarget.value)}
                    placeholder="120"
                    type="number"
                    value={manualRuntimeMinutes}
                  />
                </label>
              </div>
            ) : null}
          </div>

          {manualFilm ? (
            <div className="selected-film" aria-live="polite">
              <span>Manual film</span>
              <strong>
                {manualFilm.title} · {manualFilm.runtimeMinutes} min
              </strong>
            </div>
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
            !filmForSession ||
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
            <span
              className={`pill ${
                state.createdSession.status === "complete"
                  ? "pill-success"
                  : watchHasPaired
                    ? "pill-active"
                    : "pill-waiting"
              }`}
            >
              {SESSION_STATUS_LABEL[state.createdSession.status]}
            </span>
            <h3>{state.createdSession.filmTitle}</h3>
            <p>{SESSION_STATUS_DETAIL[state.createdSession.status]}</p>
          </div>

          <ol className="session-progress" aria-label="Session progress">
            {SESSION_STATUS_ORDER.map((status) => {
              const currentIndex = SESSION_STATUS_ORDER.indexOf(state.createdSession!.status);
              const stepIndex = SESSION_STATUS_ORDER.indexOf(status);
              return (
                <li
                  className={
                    stepIndex < currentIndex
                      ? "is-complete"
                      : stepIndex === currentIndex
                        ? "is-current"
                        : ""
                  }
                  key={status}
                >
                  <span>{stepIndex + 1}</span>
                  <strong>{SESSION_STATUS_LABEL[status]}</strong>
                </li>
              );
            })}
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
