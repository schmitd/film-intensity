# Insufficient-data read contract

All-missing sensor input has no intensity score or band. It is not scored zero
and is not classified calm. A genuine score of zero remains a valid calm result.

## Current outputs

- `computeSampleIntensity` returns a number or null
- Buckets retain received-row `sampleCount`; add `usableSampleCount` and
  `dataStatus` (`available` or `insufficient-data`). `intensityScore` is nullable
- Summaries have nullable `averageIntensity`, `peakIntensity` and `dominantBand`,
  plus `dataStatus`, `totalSampleCount`, `usableSampleCount` and `sampleCoverage`
- Ranked moments include only scored buckets, so their scores stay numeric
- Coverage is usable received rows divided by received rows. With no rows or
  unknown legacy counts it is null, not a fabricated 0% or 100%
- A usable row has at least one finite scoring input. HR-only data is usable;
  zero stress/HRV remain present. Availability is not scientific confidence,
  full sensor support or coverage of the movie's duration

The shared scorer excludes missing rows from averages while retaining gap
buckets. Cross-viewer aggregation excludes unavailable scores and averages each
metric only over present contributors. UI gaps use neutral markers; missing
scores/bands display “Insufficient data.” Film rankings and dashboard averages
exclude unavailable results.

## Compatibility and release decision

Device ingestion remains `schemaVersion: 1`. Its requests and responses are
unchanged. Existing stored sessions contain raw samples and need no migration;
new availability results are recomputed when read.

The intensity read endpoint now declares `schemaVersion: 2` and includes its
summary. This is a breaking read-result change for external clients that enforce
the former numeric-only score schema. In-repository consumers are coordinated.
New parsers still accept older numeric payloads with absent availability fields;
absence means unknown coverage, not full coverage.

Parsing a legacy precomputed numeric result does not repair its historical score
semantics. Recomputing from raw samples supplies the new availability evidence;
external caches of old results need refresh or migration during rollout.

Before deployment, decide and verify the consumer rollout: migrate all external
readers or expose a separately versioned endpoint with an explicit legacy policy.
Merely adding the version marker does not migrate existing clients. No production
deployment or data migration is part of this patch. The former suggestion of
numeric v1 placeholders is superseded; this patch deliberately uses nulls to
avoid fake-calm values.

The unused normalized Drizzle aggregate table still has a non-null score column.
No runtime reads/writes of that table were found. It is untouched; future
normalized persistence must explicitly accommodate unavailable results.

## Verification and limits

Tests cover empty/all-missing, partial and non-finite readings, genuine zero,
cross-viewer aggregation, ranking, old raw records/payloads, JSON nulls and UI gap
rendering. Sensor replay covers stale input after its adapter converts expired
events to null, and preserves the licensed HR fixture's numeric results.

Stored samples lack per-signal observation age. This patch cannot detect stale
but non-null readings retained by the watch. Real sensor validation, callback
timing, battery effects and the Garmin runtime remain separate work.
