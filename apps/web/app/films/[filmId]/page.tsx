import Link from "next/link";
import { notFound } from "next/navigation";
import { classifyIntensity } from "@film-intensity/shared";

import { MomentList, Timeline } from "../../../components/timeline";
import {
  getFilmById,
  getFilmBuckets,
  getFilmMoments,
  getFilmSummary,
  listLiveSessions,
  listSessions,
} from "../../../lib/store";
import { formatTime } from "../../../lib/utils";

export const dynamic = "force-dynamic";

export default async function FilmPage({
  params,
}: {
  params: Promise<{ filmId: string }>;
}) {
  const { filmId } = await params;
  const film = await getFilmById(filmId);

  if (!film) {
    notFound();
  }

  const [buckets, moments, summary, sessions, liveSessions] = await Promise.all(
    [
      getFilmBuckets(filmId),
      getFilmMoments(filmId),
      getFilmSummary(filmId),
      listSessions(),
      listLiveSessions(),
    ],
  );
  const completedSessions = sessions.filter(
    (session) => session.filmId === filmId && session.status === "complete",
  );
  const liveSessionsForFilm = liveSessions.filter(
    (session) => session.filmId === filmId,
  );

  return (
    <main className="page-shell">
      <section className="detail-hero">
        <div className="detail-copy">
          <Link className="muted" href="/">
            Back to sessions
          </Link>
          <h1>{film.title}</h1>
          <div className="film-meta">
            <span>{film.director}</span>
            <span>{film.runtimeMinutes} min</span>
            <span>{completedSessions.length} completed screenings</span>
            <span>{liveSessionsForFilm.length} active captures</span>
          </div>
        </div>

        <div className="detail-stat-band">
          <div>
            <span>Peak intensity</span>
            <strong
              className={
                summary.peakIntensity === null ? "data-unavailable" : undefined
              }
            >
              {summary.peakIntensity ?? "Insufficient data"}
            </strong>
          </div>
          <div>
            <span>Typical intensity</span>
            <strong
              className={
                summary.averageIntensity === null
                  ? "data-unavailable"
                  : undefined
              }
            >
              {summary.averageIntensity ?? "Insufficient data"}
            </strong>
          </div>
          <div>
            <span>Main pattern</span>
            <strong
              className={
                summary.dominantBand === null
                  ? "data-unavailable"
                  : `band-text ${classifyIntensity(summary.peakIntensity)}`
              }
            >
              {summary.dominantBand ?? "Insufficient data"}
            </strong>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <section className="timeline-surface" aria-labelledby="timeline-title">
          <div className="surface-heading">
            <div>
              <h2 id="timeline-title">Audience reaction over time</h2>
            </div>
          </div>
          <Timeline
            buckets={buckets}
            moments={moments}
            runtimeMinutes={film.runtimeMinutes}
            viewerCount={completedSessions.length}
          />
        </section>

        <aside className="sidebar-surface" aria-labelledby="moments-title">
          <div className="surface-heading">
            <div>
              <h2 id="moments-title">Most reactive moments</h2>
            </div>
          </div>
          <MomentList moments={moments} />
        </aside>
      </section>

      <section className="chapter-grid">
        <div className="chapter-heading">
          <h2>Sessions for this film</h2>
        </div>
        <div className="ops-surface">
          <ul className="session-stream">
            {completedSessions.map((session) => (
              <li className="session-line" key={session.id}>
                <div>
                  <strong>{session.deviceModel ?? "Garmin watch"}</strong>
                  <p>{formatTime(session.completedAt ?? session.createdAt)}</p>
                </div>
                <div className="session-tags">
                  <span className="mono">{session.samples.length} samples</span>
                  <span>
                    {session.capabilities.hrv
                      ? "HRV present"
                      : "HRV unavailable"}
                  </span>
                  <span>
                    {session.capabilities.stress
                      ? "Stress tracked"
                      : "Stress unavailable"}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <section
            className="live-tower"
            aria-labelledby="active-capture-title"
          >
            <h3 id="active-capture-title">Active capture state</h3>
            {liveSessionsForFilm.length ? (
              <ul className="active-session-list">
                {liveSessionsForFilm.map((session) => (
                  <li className="tower-line" key={session.id}>
                    <strong>{session.deviceModel ?? "Unpaired watch"}</strong>
                    <span>{session.status}</span>
                    <span className="mono">pair {session.pairCode}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No active watches.</p>
            )}
            <Link className="button secondary" href="/">
              Start another session
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
