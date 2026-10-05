import { readFileSync } from "node:fs";
import { parseEmpaticaHr, sampleSensorEvents, scoreReplay } from "./replay.mjs";
import { syntheticScreening } from "./synthetic.mjs";

const fixture = syntheticScreening();
const real = parseEmpaticaHr(
  readFileSync(
    new URL(
      "../../fixtures/sensor-replay/physionet-S01-HR-excerpt.csv",
      import.meta.url,
    ),
    "utf8",
  ),
);
function summarize(name, frames) {
  const scored = scoreReplay(frames);
  return {
    name,
    captureCount: frames.length,
    quality: Object.fromEntries(
      ["available", "missing-or-stale", "invalid-hr"].map((quality) => [
        quality,
        frames.filter((f) => f.annotation.quality === quality).length,
      ]),
    ),
    scoreKind: scored.scoreKind,
    missingSignalTimes: scored.missingSignalTimes,
    warnings: scored.warnings,
    summary: scored.summary,
    labelPolicy:
      "No film-intensity or emotion ground-truth labels are asserted",
  };
}
console.log(
  JSON.stringify(
    [
      summarize(
        "synthetic-gap-noise",
        sampleSensorEvents(fixture.events, { durationMs: fixture.durationMs }),
      ),
      summarize(
        "physionet-S01-HR-excerpt",
        sampleSensorEvents(real.events, {
          durationMs: 60000,
          epochMs: real.startMs,
        }),
      ),
    ],
    null,
    2,
  ),
);
