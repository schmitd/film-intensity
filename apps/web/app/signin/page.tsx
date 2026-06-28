import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card stack">
          <span className="section-label">Account access</span>
          <h1>Light accounts land here.</h1>
          <p>
            The UI and route contracts are ready for Auth.js email magic links. This scaffold
            keeps the app in single-user mode until the email provider and database adapter
            are configured.
          </p>
          <Link className="button" href="/">
            Return to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
