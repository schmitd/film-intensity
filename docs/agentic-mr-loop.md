# Agentic MR Loop

This loop turns recurring bug and enhancement discovery into small, reviewable
merge requests. It is designed for Codex-style agents using short-lived
subthreads, but the output is a normal branch and MR with ordinary tests.

## Operating Goal

Create one useful MR per loop, not a broad refactor. The MR must improve a real
end-to-end product path, reduce operational cost, harden an integration
boundary, or remove a verified bug.

Do not create MRs for speculative cleanup, cosmetic churn, generated data, or
demo content.

## Schedule

Run three scheduled loops per week:

| Time | Loop | Output |
| --- | --- | --- |
| Monday 09:00 local | Production-economy scan | One MR that reduces requests, runtime cost, retries, or noisy work |
| Wednesday 09:00 local | End-to-end experience scan | One MR that improves create, pair, record, upload, complete, or review |
| Friday 09:00 local | Release-readiness scan | One MR that improves verification, docs, packaging, privacy, or deployment |

Run an unscheduled hotfix loop only when a concrete failure exists in logs,
tests, local reproduction, preview deploys, or hardware validation.

## Loop Contract

Each scheduled loop has five phases:

1. Discover: find three candidate issues or enhancements.
2. Rank: choose one candidate using the scoring rubric below.
3. Scope: define a branch, file ownership, acceptance checks, and rollback
   plan.
4. Implement: use workers only for disjoint file sets.
5. Verify and MR: run the required checks and create the MR description.

Stop the loop if no candidate scores high enough to justify code changes. In
that case, create a short note instead of an MR.

## Discovery Lanes

Use these lanes to find candidates.

| Lane | Questions | Evidence |
| --- | --- | --- |
| E2E flow | Can a user create, pair, record, upload, complete, and review without confusing states? | API smoke output, UI state review, watch state transitions |
| Request economy | Is any path polling, retrying, rebuilding, or uploading more than needed? | Route counts, loop intervals, batch sizes, Vercel usage, code inspection |
| Watch reliability | Can the Garmin app recover from offline, partial upload, failed pair, and restart? | `pnpm watch:check`, state persistence, buffer behavior |
| Data integrity | Can contracts, store writes, or aggregation produce stale or impossible state? | shared tests, route schemas, store/DB paths |
| Release surface | Does the app show fake data, technical errors, unclear copy, or unsupported behavior? | UI review, docs, empty/error states |
| Deployment | Can a preview or production deploy run the same path with the documented env vars? | CI, Vercel preview, deployment docs |

## Candidate Scoring

Score each candidate from 0 to 2 in each category:

| Category | 0 | 1 | 2 |
| --- | --- | --- | --- |
| User impact | Internal only | Noticeable improvement | Fixes or unlocks a primary flow |
| Cost impact | No runtime impact | Small request/build/runtime reduction | Meaningful Vercel, API, or battery reduction |
| Confidence | Hypothesis only | Reproducible by inspection | Reproduced by test, command, or deployed behavior |
| Scope | Cross-cutting or vague | Two surfaces | One coherent boundary |
| Verification | Hard to verify | Local command verifies | E2E or hardware-adjacent check verifies |

Create an MR only when the total score is 6 or higher and scope is not 0.

## Agent Topology

Use one main integrator and up to three subagents.

| Agent | Type | Task |
| --- | --- | --- |
| Main integrator | main thread | Chooses candidate, owns final patch, MR text, and final verification |
| Explorer A | explorer | Inspect one producer side, such as web form, watch state, worker job, or deploy config |
| Explorer B | explorer | Inspect one consumer side, such as route handler, store, shared contract, or UI result |
| Worker | worker | Patch the selected file set only, when the scope is safely separable |
| Verification explorer | explorer | Run targeted checks or summarize first failure when checks are slow or risky |

Do not spawn agents for the same question twice. Do not allow parallel workers to
edit the same file.

## Branch And MR Rules

Use these names:

```text
agent/<lane>/<short-problem>
```

Examples:

```text
agent/request-economy/reduce-watch-upload-chatter
agent/e2e/manual-film-session-fallback
agent/watch/offline-completion-retry
```

Each MR should fit one of these labels:

- `bug`
- `enhancement`
- `request-economy`
- `watch`
- `web`
- `worker`
- `release-readiness`

## File Ownership Defaults

Use the narrowest file set that can solve the selected candidate.

| Scope | Files |
| --- | --- |
| Web flow | `apps/web/components/**`, `apps/web/app/**`, `apps/web/lib/**` |
| Device API | `apps/web/app/api/device/**`, `packages/shared/src/contracts.ts`, `apps/web/lib/store.ts` |
| Watch app | `apps/watch/source/**`, `apps/watch/resources/**`, `apps/watch/scripts/**` |
| Scoring/contracts | `packages/shared/src/**` |
| Worker/DB | `apps/worker/src/**`, `packages/db/src/**` |
| Release/docs | `docs/**`, `README.md`, `PRODUCT.md`, `DESIGN.md`, `.github/**` |

## Required Verification

Always run the smallest relevant checks first, then the final gate.

For web/API changes:

```bash
pnpm --filter @film-intensity/web typecheck
pnpm --filter @film-intensity/web build
FILM_INTENSITY_BASE_URL=http://localhost:3000 pnpm test:e2e:api
```

For shared contract/scoring changes:

```bash
pnpm --filter @film-intensity/shared test
pnpm --filter @film-intensity/shared typecheck
```

For watch changes:

```bash
pnpm watch:check
```

For worker/DB changes:

```bash
pnpm --filter @film-intensity/db typecheck
pnpm --filter @film-intensity/worker typecheck
pnpm worker:run
```

Before MR creation, run:

```bash
pnpm typecheck
pnpm build
```

Run `pnpm build` and `pnpm typecheck` sequentially, not in parallel, because
Next.js `.next/types` generation can race.

## MR Template

Use this template for every agent-created MR:

```markdown
## Summary

- 

## Discovery Evidence

- Lane:
- Candidate score:
- Reproduction or inspection evidence:

## Changes

- 

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] Relevant targeted checks:

## Request And Runtime Impact

- Expected request count change:
- Battery/runtime impact:
- Vercel impact:

## Risks

- 

## Not Included

- 
```

## Ready-To-Use Prompts

Discovery prompt:

```text
In /home/david/projects/film-intensity, run the <lane> discovery lane from
docs/agentic-mr-loop.md. Do not edit files. Return exactly three candidate MRs,
each with evidence, score, likely files, and verification commands.
```

Scope prompt:

```text
Use docs/agentic-mr-loop.md to scope this candidate: <candidate>. Return branch
name, MR title, file ownership, acceptance checks, rollback plan, and the one
thing that would make the MR too large.
```

Worker prompt:

```text
In /home/david/projects/film-intensity, implement this scoped MR only:
<scope>. Own only <files>. You are not alone in the codebase; do not revert
unrelated changes. Return changed files, commands run, and remaining risks.
```

Verification prompt:

```text
In /home/david/projects/film-intensity, verify this MR candidate using these
commands: <commands>. Do not edit files. Stop at the first real failure and
return the shortest actionable summary.
```

MR finalization prompt:

```text
Prepare the MR body using docs/agentic-mr-loop.md. Include discovery evidence,
request/runtime impact, verification, risks, and what was intentionally left
out. Do not include speculative claims.
```

## Current High-Value Backlog

Prefer these scheduled MR candidates until they are resolved:

1. Durable persistence: move prototype JSON/JSONB store behavior toward the
   normalized DB schema.
2. Worker recompute: replace fixture scoring with idempotent completed-session
   aggregate recomputation.
3. Watch upload recovery: harden partial-batch retry and completion retry after
   app restart.
4. Preview smoke: run `pnpm test:e2e:api` against a Vercel preview deployment.
5. Hardware smoke: complete a short Venu 2 capture against a preview backend.

