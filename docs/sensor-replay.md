# SDK-free sensor replay tests

This increment tests sensor-data plumbing and an explicit reference queue model.
It does not execute the Garmin app, replace the Garmin simulator, or validate
physiological interpretations. Apply it after the upload-integrity patch.

## Run

Tested with Node 22.23.3. No new dependencies or Garmin SDK are needed.

```sh
pnpm test:sensor-replay
pnpm sensor:replay
```

The tests import the real shared scoring functions and backend deduplicator.
The CaptureModel class is an executable specification for future watch work,
not a translated or emulated Monkey C runtime. Its fake storage can reject writes
and retain a snapshot across a modeled restart.

## Included signals

- Deterministic synthetic heart rate and beat intervals, with known omissions,
  invalid negative HR and a deliberately elevated period
- A 61-reading, one-minute HR excerpt from the open PhysioNet dataset credited
  below. The device-derived HR values and CSV header are preserved unchanged
- Five-second captures use only readings at or before the capture time. Readings
  older than the freshness limit become missing. There is no gap interpolation
- HR is rounded for the app's integer schema; raw values stay in the fixture
- The CSV header has no zone suffix. UTC interpretation follows the source
  dataset's README; for other files, this adapter treats a naive header as UTC
- RMSSD is derived only when a synthetic interval window contains at least two
  valid positive intervals. No HRV is fabricated from the real HR-only excerpt
- No stress value is inferred from EDA, a study condition, or elevated HR

Quality flags and source labels remain separate from measurements. The
synthetic elevated period is not evidence of a film response. The real excerpt's
protocol folder is STRESS, but its exact task phase is unassigned. The harness
never turns that folder name into a Garmin stress value or emotion label.

## What the tests cover

Missing/stale readings, invalid readings, deterministic conversion, elapsed-time
preservation, interval math, finite bounded shared scoring, out-of-order rejection,
25-second pending requests, Stop, restart snapshots, partial/invalid acknowledgments,
lost responses against actual backend deduplication, and injected storage failure.

The replay originally exposed a scoring defect: all-missing input received 40,
classified as calm. The subsequent data-quality increment fixes this with null
scores and explicit insufficient-data metadata. Reports mark missing-signal
times and never interpret those gaps as observed calm. See `data-quality.md`.

## Dataset provenance and license

Contains information from **Wearable Device Dataset from Induced Stress and
Structured Exercise Sessions**, version 1.0.1, available under the
[Open Data Commons Attribution License v1.0](https://physionet.org/content/wearable-device-dataset/1.0.1/LICENSE.txt).

Hongn, A., Bosch, F., Prado, L., & Bonomini, P. (2025). PhysioNet.
[Dataset DOI](https://doi.org/10.13026/he0v-tf17).
[Original publication](https://doi.org/10.1038/s41597-025-04845-9).
[Dataset documentation](https://physionet.org/content/wearable-device-dataset/1.0.1/).

Only the published de-identified S01 HR CSV was downloaded, not demographics or
questionnaires. Source and excerpt SHA256 hashes, source URL, version, extraction
window, attribution and transformations are recorded in
`fixtures/sensor-replay/provenance.json`. The original file has 2,215 readings;
the fixture preserves its first 61. It is PPG-derived device HR, not ECG-reference
ground truth or Garmin output. No raw waveform processing is claimed.

## Other datasets considered

- [PPG-DaLiA at UCI](https://archive.ics.uci.edu/dataset/495/ppg): PPG, motion and
  ECG-derived HR labels for everyday activity. UCI lists CC BY 4.0, but its full
  archive is 2.7 GB. Better for future motion/HR-estimation work than this small
  integration fixture; no archive was downloaded
- [WESAD original owner](https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html):
  neutral/stress/amusement lab conditions are relevant to affect research, but
  the owner restricts use to scientific, non-commercial purposes with credit.
  No download or incorporation was made; product use needs separate suitability
  and permission review

## Future relabeling protocol

1. Keep raw values, participant/session boundaries, timestamps, license and source
   checksums unchanged in provenance
2. Normalize units and align clocks using documented sample rates. Keep missing
   spans missing and record every interpolation or filtering rule if later added
3. Preserve original task annotations under sourceLabel. Add quality annotations
   such as missing, device-invalid or injected-corruption with method/version
4. Keep computed HRV and app scores explicitly derived. Never rename an exercise,
   stress or amusement condition as movie intensity
5. Film-response labels would need film timestamps and independent viewer ratings;
   this harness supplies neither. If later training models, separate participants
   between train/validation/test and keep synthetic corruption variants together

Real-device sensor characteristics, battery effects, 32 KB Garmin storage-value
limits, lifecycle transitions, callbacks and actual Monkey C behavior remain
outside these tests.
