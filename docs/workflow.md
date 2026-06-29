# Film Intensity Workflow

This workflow connects the release surfaces in this repo: the Next.js web app,
device APIs, Garmin Connect IQ app, shared scoring package, persistence layer,
and aggregation worker.

## End-To-End Product Flow

1. Web user searches for a film through `/api/web/films/search`.
2. Web user creates a screening session through `POST /api/web/sessions`.
3. Web app displays the generated pair code and the session state.
4. Watch user enters or confirms the pair code in the Garmin app.
5. Watch app calls `POST /api/device/pair` with device identity and app version.
6. Watch app calls `GET /api/device/active-session` with its device credentials.
7. Watch app records samples during playback and periodically calls
   `POST /api/device/session-batch`.
8. Watch app marks the screening done with `POST /api/device/session-complete`.
9. Web film page reads `/api/web/films/{filmId}/intensity` and
   `/api/web/films/{filmId}/moments` to render the curve and peak moments.
10. Worker jobs recompute or repair aggregate state for production data stores.

## Runtime Ownership

- `apps/web`: owns the browser UI, session creation, device route handlers, and
  current prototype persistence in `apps/web/lib/store.ts`.
- `apps/watch`: owns pairing, recording state, local sample buffering, and upload
  retries from the Connect IQ app.
- `packages/shared`: owns API contracts, sample schemas, scoring, bucketization,
  and moment extraction.
- `packages/db`: owns the intended Postgres schema and database client.
- `apps/worker`: should own scheduled aggregate recomputation, upload repair,
  backfills, and cleanup once production persistence is moved fully into the DB.

## Session State Schedule

| State | Entered by | Exit condition | Acceptance signal |
| --- | --- | --- | --- |
| `created` | Web session creation | Watch pairs with code | Home page shows pair code |
| `paired` | `POST /api/device/pair` | Watch starts capture | Session API shows device model |
| `recording` | Watch capture loop | Upload begins | Watch UI shows active recording |
| `uploading` | `POST /api/device/session-batch` | Completion payload accepted | Batch response returns accepted sample count |
| `complete` | `POST /api/device/session-complete` | Aggregates visible | Film page shows non-empty timeline and moments |

The watch sends an explicit `POST /api/device/session-start` when recording
begins so the web state can move from `paired` to `recording` before any sample
batch is uploaded.

## Request Budget

Keep the production request model sparse:

- The watch pairs only on an explicit SELECT action. It does not auto-poll pair
  attempts while idle.
- Failed watch pairing attempts use a local cooldown before another request is
  allowed.
- The watch captures samples locally every 5 seconds, but uploads only after 24
  queued samples or when the recording stops. Batches can include up to 30
  samples.
- The browser status card polls every 15 seconds while waiting/pairing or
  uploading, every 90 seconds during the long recording window, and every 120
  seconds in a hidden tab. Polling stops when the session reaches `complete`.
- Avoid WebSockets for watch ingestion. Keep the device path to four sparse
  request types: pair, start, batched upload, complete.
- Consider hosted realtime only for browser display if dashboard immediacy is
  worth the extra infrastructure; do not move durable state into a long-lived
  Vercel Function.

## Testing Plan

### Contract And Scoring

Run on every change:

```bash
pnpm --filter @film-intensity/shared test
pnpm --filter @film-intensity/shared typecheck
```

These tests protect Zod schemas, score ranges, bucket creation, and moment
ranking. Expand them whenever payload fields or scoring rules change.

### Web And API

Run before merging:

```bash
pnpm --filter @film-intensity/web typecheck
pnpm --filter @film-intensity/web build
```

Then run the API smoke test against a local or preview server:

```bash
pnpm --filter @film-intensity/web dev
FILM_INTENSITY_BASE_URL=http://localhost:3000 pnpm test:e2e:api
```

The smoke test creates a deterministic session, pairs a synthetic watch,
uploads samples, completes the session, and verifies that intensity buckets and
moments are exposed for the film.

### Watch

Fast feedback:

```bash
pnpm watch:check
```

Target-device feedback after Garmin SDK Manager has installed device libraries:

```bash
DEVICE=venu3 pnpm --filter @film-intensity/watch build
pnpm watch:sim
```

Manual hardware acceptance:

1. Sideload the generated app to a supported Garmin watch.
2. Set the app Backend URL to the local tunnel, preview deploy, or production
   origin.
3. Create a web session and pair the watch.
4. Start a short capture, upload at least two batches, and complete it.
5. Confirm the web film page shows a completed session, samples, timeline
   buckets, and ranked moments.

### Worker

Current worker behavior is a scoring smoke run over fixture data:

```bash
pnpm --filter @film-intensity/worker typecheck
pnpm worker:run
```

Before production launch, replace the fixture worker with scheduled jobs that
read real sessions from Postgres and write materialized film aggregates. The
first production worker tests should cover idempotent recompute, partial upload
repair, stale live-session cleanup, and backfill from raw samples.

## Integration Milestones

1. Stabilize contracts: keep all request and response schemas in
   `packages/shared`, and reject invalid payloads at every route boundary.
2. Prove the API loop: run `pnpm test:e2e:api` against local Next and Vercel
   preview deployments.
3. Prove watch packaging: run `pnpm watch:check` locally and a target build for
   each supported Garmin family.
4. Prove real-device upload: pair one physical watch with a preview deployment
   and complete a short screening.
5. Move persistence from prototype store behavior to Postgres-backed durable
   tables and migrations.
6. Replace fixture worker logic with scheduled production recomputation.
7. Add CI gates for shared tests, web typecheck/build, API smoke against preview,
   and watch compile once Garmin SDK tooling is provisioned for runners.

## Agent Operating Schedule

Use one main thread as the product integrator and short-lived subagent threads
for bounded research, implementation, and verification. The main thread owns
the product direction, merge decisions, final test run, and release notes.
Subagents should return evidence and patches, not broad commentary.

For scheduled MR creation, use [Agentic MR Loop](agentic-mr-loop.md). That
runbook defines discovery lanes, candidate scoring, branch names, MR templates,
and verification gates for recurring bug and enhancement work.

### Loop Cadence

Run this loop for every product-development cycle:

1. Frame: main thread writes the user outcome, target files, acceptance checks,
   and risks in 10 lines or less.
2. Split: main thread opens only the subthreads needed for independent work.
3. Build: worker subagents patch disjoint file sets; explorer subagents answer
   narrow codebase questions.
4. Integrate: main thread reviews subagent output, resolves conflicts, and keeps
   the workflow coherent across web, watch, worker, shared contracts, and docs.
5. Verify: verification subthreads run targeted checks while the main thread
   runs the final cross-surface gate.
6. Decide: main thread records the next blocking product question or ships the
   increment.

Default cadence for active development:

| Window | Main thread | Subagents |
| --- | --- | --- |
| 0-10 min | Define outcome, inspect current status, assign threads | None unless the split is obvious |
| 10-45 min | Integrate shared contract or architecture decisions | Web worker, watch worker, DB/worker worker |
| 45-60 min | Review patches and run cross-surface checks | Verification explorer runs focused failures |
| End | Summarize shipped behavior, test evidence, and next risk | Close completed threads |

### Token Budget Rules

- Keep the main thread focused on decisions and integration. Do not ask it to
  re-read entire modules after a subagent has returned a specific answer.
- Give each subagent a narrow file set, exact question, and expected output.
- Give each subagent only the files it needs. Start from the module ownership
  table below instead of pasting broad repo context.
- Prefer one explorer per unknown, not one explorer per package.
- Prefer one worker per disjoint write scope. Do not let two workers edit the
  same file set in parallel.
- Ask subagents for file paths, commands run, and remaining risks. Do not ask
  for long narrative summaries.
- Close completed subagent threads once their result is integrated.
- Start a new thread when the topic changes from design, to implementation, to
  debugging, to release verification. Resume an old thread only when the new
  question depends on its previous context.
- Do not reintroduce demo or fake release-surface fallbacks. Synthetic data
  belongs in tests, fixtures, or explicit E2E smoke runs only.

### Standard Subagent Roles

Use these repeatable assignments.

| Role | Type | Owns | Typical prompt |
| --- | --- | --- | --- |
| Contract explorer | explorer | `packages/shared`, route payloads | "Find schema or endpoint mismatches for this feature. Return exact files and risks only." |
| Web worker | worker | `apps/web`, UI, route handlers | "Implement this web/API slice only. Do not edit watch or worker files." |
| Watch worker | worker | `apps/watch` | "Implement or inspect the Connect IQ state/upload slice. Preserve Venu 2 round-safe 416x416 UI constraints." |
| Persistence worker | worker | `packages/db`, store migration, worker jobs | "Implement durable persistence or scheduled recompute logic. Do not edit web UI." |
| Verification explorer | explorer | commands and failure triage | "Run the named checks, identify the first real failure, and return command output summary." |
| Release explorer | explorer | docs, deployment, store checklist | "Check whether this increment is releasable and list missing operational steps." |

### Module Ownership Map

Use these scopes when assigning work:

| Specialist | Primary files | Verification commands |
| --- | --- | --- |
| Contracts/scoring | `packages/shared/src/contracts.ts`, `packages/shared/src/scoring.ts`, `packages/shared/src/*.test.ts` | `pnpm --filter @film-intensity/shared test`, `pnpm --filter @film-intensity/shared typecheck` |
| Web/API | `apps/web/app/api/**`, `apps/web/lib/store.ts`, `apps/web/lib/tmdb.ts`, `apps/web/components/**`, `apps/web/app/**` | `pnpm --filter @film-intensity/web typecheck`, `pnpm --filter @film-intensity/web build`, `FILM_INTENSITY_BASE_URL=http://localhost:3000 pnpm test:e2e:api` |
| Watch | `apps/watch/source/**`, `apps/watch/resources/**`, `apps/watch/scripts/**`, `apps/watch/README.md` | `pnpm watch:check`, `DEVICE=venu2 pnpm --filter @film-intensity/watch build` |
| Persistence/worker | `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `apps/worker/src/index.ts`, DB-backed store migration code | `pnpm --filter @film-intensity/db typecheck`, `pnpm --filter @film-intensity/worker typecheck`, `pnpm worker:run` |
| Release/docs | `docs/**`, `README.md`, `PRODUCT.md`, `DESIGN.md`, deployment notes | `pnpm build`, release checklist review |

In this workspace, agents running `pnpm` may need the Linux Node path prefix:

```bash
export PATH="/home/david/.vscodium-server/bin/df23b135987b9b1449efdfb550fe90f38539b749:$PATH"
```

Persistence deserves its own thread. `apps/web/lib/store.ts` currently bridges
local file storage and a JSONB Postgres fallback, while `packages/db/src/schema.ts`
describes the intended normalized model. Do not mix normalized persistence,
worker recompute, and web UI polish in the same subagent task.

### Thread Handoff Contract

Every subagent response should include:

- Decision or patch summary in 5 bullets or fewer.
- Changed files, if any.
- Commands run and pass/fail status.
- Open risks that the main thread must decide.
- Anything intentionally not touched.

Every main-thread integration pass should include:

- Whether the returned work was accepted, edited, or discarded.
- Why any conflict was resolved a certain way.
- Final commands run from the integrated tree.
- The next best subthread to open, if more work remains.

### Product Refinement Loop

Use this when improving the application experience:

1. Main thread defines the target user moment, for example "viewer completes a
   screening and sees a meaningful curve."
2. Web explorer checks UI and endpoint gaps.
3. Watch explorer checks device-state and upload gaps.
4. Main thread chooses the smallest coherent increment.
5. Web worker and watch worker implement disjoint slices only when both sides
   need code.
6. Verification explorer runs the API smoke test and any targeted device build
   command that does not require manual hardware.
7. Main thread performs final `pnpm typecheck`, `pnpm build`, and documents any
   watch hardware checks still pending.

### Debugging Loop

Use this when a test, upload, pairing, or deployment path fails:

1. Main thread captures the exact command, payload, route, device state, or URL.
2. Explorer A traces the producer side, such as watch upload or web form submit.
3. Explorer B traces the consumer side, such as route handler, store, DB, or
   aggregation read path.
4. Main thread compares the two traces and assigns one worker to the smallest
   file set that can fix the mismatch.
5. Verification explorer reruns only the failing command first.
6. Main thread reruns the full relevant gate after the targeted fix passes.

Do not open broad "debug the app" threads. Open threads around one failing
boundary: film search, session creation, pairing, active session lookup, sample
batch upload, completion, aggregation, watch build, or deployment.

### Development Backlog Schedule

Run the next application work in this order:

1. Explicit recording transition: add an API path and watch call so `recording`
   is a real state before `uploading`.
2. Durable persistence: move prototype store behavior into the Drizzle/Postgres
   model and keep the API smoke test passing against both local and DB-backed
   modes.
3. Worker recompute: replace fixture logic with idempotent aggregate jobs for
   completed sessions.
4. Watch upload hardening: add retry, partial-batch recovery, and clear upload
   states.
5. Preview verification: run `pnpm test:e2e:api` against a Vercel preview URL.
6. Hardware pass: sideload to the supported Garmin target and complete a short
   real capture.
7. Release pass: verify privacy language, non-medical positioning, screenshots,
   support contact, and Garmin package export.

### Ready-To-Use Thread Prompts

Contract explorer:

```text
In /home/david/projects/film-intensity, inspect packages/shared and the API
routes for this feature: <feature>. Do not edit files. Return schema mismatches,
missing states, and exact route files that need changes.
```

Web worker:

```text
In /home/david/projects/film-intensity, implement only the web/API slice for
<feature>. Own apps/web and packages/shared if needed. Do not edit apps/watch.
You are not alone in the codebase; do not revert unrelated changes. Return files
changed and commands run.
```

Watch worker:

```text
In /home/david/projects/film-intensity, implement only the Garmin watch slice
for <feature>. Own apps/watch. Preserve round Venu readability and do not edit
web or DB files. You are not alone in the codebase; do not revert unrelated
changes. Return files changed and commands run.
```

Verification explorer:

```text
In /home/david/projects/film-intensity, run these checks: <commands>. Do not
edit files. If one fails, stop at the first real failure and return the shortest
actionable failure summary with file paths or commands.
```
