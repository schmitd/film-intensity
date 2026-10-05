# Device upload retry contract

The existing v1 watch payloads remain supported; no app or schema-version change
is needed. Recording-start and completion schemas accept ISO strings or Garmin
epoch milliseconds and normalize numeric input to ISO strings. Completion time
is persisted; this increment does not change how session start time is stored.

## Sequential retry behavior

- A reading is identified within its session by timestamp instant plus elapsed
  milliseconds. ISO and numeric timestamps for the same instant match.
- An identical replay is acknowledged without inserting another reading.
  Duplicate rows and overlapping batches are handled the same way.
- Retry acknowledgement still waits for a successful store write, covering a
  previous transient write failure that left newer data in the process cache.
- `acceptedSamples` remains the number of acknowledged input rows, including
  replays. The watch interprets it as the consumed prefix of its pending batch.
  `totalSamples` reports the number of stored readings.
- Conflicting readings at the same identity reject the whole batch with HTTP
  409. No earlier rows from that request are inserted.
- A completed session accepts duplicate-only batches as no-ops. New or changed
  readings return 409, and pairing or start cannot reopen a completed session.
- Completion requires `totalSamples` to match the stored count. A matching-count
  completion retry preserves the first completion time and capabilities, even
  if the watch sends a later time or redetects capabilities after restarting.

## Verification

With dependencies installed:

```sh
pnpm --filter @film-intensity/shared test
pnpm --filter @film-intensity/web test
pnpm typecheck
pnpm build
FILM_INTENSITY_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e:api
```

The core deduplication tests also run without dependencies on Node 22.6+:

```sh
node --experimental-strip-types --test scripts/upload-core.test.mjs
```

Web tests exercise the actual route handlers against an in-memory filesystem
stub, including a persisted-state reload. The API smoke uses a running local
server and synthetic samples. Neither substitutes for database or Garmin testing.

## Remaining limits

This is not distributed exactly-once delivery. The prototype JSON/JSONB store
still uses a process-local cache and whole-document writes; concurrent instances
can overwrite each other. Transactional normalized persistence remains a
separate increment. Historical duplicate rows are not silently repaired: strict
completion checks can expose a count mismatch in such sessions. A client sending
duplicate rows inside a single batch must use the unique stored count for
completion; ordinary Garmin capture generates distinct elapsed times.

HTTP 409 integrity failures currently enter the watch's existing retry behavior;
an actionable on-watch conflict state is future work. The separate watch issue
where in-flight uploads pause sampling and elapsed-time advancement is also
unchanged. Compiler, simulator, hardware sensor behavior, battery usage and long
screening capture need their own verification before release.
