import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card stack">
          <span className="section-label">Not found</span>
          <h1>That film page does not exist yet.</h1>
          <p>Use the dashboard to search for a movie and create a session.</p>
          <Link className="button" href="/">
            Return to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
