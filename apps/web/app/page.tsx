import Link from "next/link";
import { classifyIntensity, type SessionStatus } from "@film-intensity/shared";

import { CreateSessionForm } from "../components/create-session-form";
import {
  getFeaturedFilms,
  listLiveSessions,
  listSessions,
} from "../lib/store";
import { formatTime } from "../lib/utils";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<SessionStatus, { label: string; detail: string }> = {
  created: {
    label: "waiting for watch",
    detail: "Open the watch app and press SELECT to pair.",
  },
  paired: {
    label: "watch paired",
    detail: "Press SELECT on the watch when the movie starts.",
  },
  recording: {
    label: "recording",
    detail: "The watch is capturing the screening.",
  },
  uploading: {
    label: "uploading",
    detail: "The watch is sending the last samples.",
  },
  complete: {
    label: "complete",
    detail: "Open the film page to review the curve.",
  },
};

type FilmChoice = {
  id: string;
  title: string;
  runtimeMinutes: number;
};

function buildFilmChoices(featuredFilms: FilmChoice[]) {
  const choices = new Map<string, FilmChoice>();

  for (const film of featuredFilms) {
    choices.set(film.id, {
      id: film.id,
      title: film.title,
      runtimeMinutes: film.runtimeMinutes,
    });
  }

  return Array.from(choices.values());
}

export default async function HomePage() {
  const [featuredFilms, liveSessions, sessions] = await Promise.all([
    getFeaturedFilms(),
    listLiveSessions(),
    listSessions(),
  ]);
  const recentSessions = sessions.slice(0, 5);
  const activeSession = liveSessions[0] ?? recentSessions.find((session) => session.status !== "complete");
  const filmChoices = buildFilmChoices(featuredFilms);
  const filmsWithResults = featuredFilms
    .filter((film) => film.completedViewerCount > 0)
    .slice(0, 4);

  return (
    <main className="page-shell">
      <section className="setup-grid" aria-label="Start a session">
        <section className="panel setup-panel" aria-labelledby="create-session-title">
          <div className="section-heading">
            <h1 id="create-session-title">Create a session</h1>
          </div>
          <CreateSessionForm films={filmChoices} />
        </section>

        <aside className="panel status-panel" aria-label="Current session status">
          <div className="section-heading">
            <h2>Current session</h2>
          </div>

          {activeSession ? (
            <div className="status-stack">
              <div className="status-title">
                <strong>{activeSession.filmTitle}</strong>
                <span className={`status-tag status-${activeSession.status}`}>
                  {STATUS_COPY[activeSession.status].label}
                </span>
              </div>
              <dl className="simple-stats">
                <div>
                  <dt>Code</dt>
                  <dd className="mono">{activeSession.pairCode}</dd>
                </div>
                <div>
                  <dt>Device</dt>
                  <dd>{activeSession.deviceModel ?? "Waiting"}</dd>
                </div>
              </dl>
              <p className="muted">{STATUS_COPY[activeSession.status].detail}</p>
              <Link className="button button-secondary" href={`/films/${activeSession.filmId}`}>
                Open results
              </Link>
            </div>
          ) : (
            <div className="empty-state">
              <p>No active session.</p>
            </div>
          )}
        </aside>
      </section>

      <section className="results-grid results-grid-single" aria-label="Film results">
        <section className="panel" aria-labelledby="results-title">
          <div className="section-heading">
            <h2 id="results-title">Results</h2>
          </div>
          {filmsWithResults.length ? (
            <ul className="film-list">
              {filmsWithResults.map((film) => (
                <li key={film.id}>
                  <Link className="film-row" href={`/films/${film.id}`}>
                    <div className="film-main">
                      <div className="film-title-line">
                        <h3>{film.title}</h3>
                        <span className={`band-pill ${classifyIntensity(film.summary.peakIntensity)}`}>
                          {film.summary.peakIntensity}
                        </span>
                      </div>
                      <div className="film-meta">
                        <span>{film.summary.dominantBand}</span>
                        <span>{film.runtimeMinutes} min</span>
                        <span>{film.completedViewerCount} completed</span>
                        <span>{film.liveSessionCount} active</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p>No completed screenings yet.</p>
            </div>
          )}
        </section>
      </section>

      <section className="panel recent-panel" aria-labelledby="recent-title">
        <div className="section-heading">
          <h2 id="recent-title">Recent sessions</h2>
        </div>
        {recentSessions.length ? (
          <ul className="session-stream">
            {recentSessions.map((session) => (
              <li className="session-line" key={session.id}>
                <div>
                  <strong>{session.filmTitle}</strong>
                  <p>{formatTime(session.completedAt ?? session.createdAt)}</p>
                </div>
                <div className="session-tags">
                  <span className={`status-tag status-${session.status}`}>{STATUS_COPY[session.status].label}</span>
                  <span className="mono">{session.pairCode}</span>
                  <span>{session.deviceModel ?? "waiting for watch"}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <p>No sessions created yet.</p>
          </div>
        )}
      </section>
    </main>
  );
}
