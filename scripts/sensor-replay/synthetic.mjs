export function syntheticScreening() {
  const events = [];
  for (let second = 0; second <= 60; second++) {
    if (second >= 20 && second <= 30) continue;
    const elevated = second >= 40 && second < 50;
    const invalid = second === 45;
    events.push({
      elapsedMs: second * 1000,
      heartRateBpm: invalid ? -999 : (elevated ? 105 : 72) + ((second % 3) - 1),
      heartBeatIntervalsMs: elevated ? [600, 610, 600] : [820, 860, 820],
      origin: "synthetic",
      sourceState: elevated
        ? "synthetic-elevated-period"
        : "synthetic-steady-period",
      injection: invalid ? "invalid-negative-hr" : null,
    });
  }
  return {
    schemaVersion: 1,
    kind: "synthetic-engineering-fixture",
    durationMs: 60000,
    provenance:
      "Hand-authored deterministic signals; no participant data or film labels",
    transformations: [
      "omitted events at seconds 20–30",
      "invalid HR at second 45",
      "deterministic ±1 bpm variation",
    ],
    events,
  };
}
