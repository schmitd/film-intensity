import {
  type FilmIntensityBucket,
  type IntenseMoment,
  classifyIntensity,
} from "@film-intensity/shared";

import { formatDuration } from "../lib/utils";

type TimelineProps = {
  buckets: FilmIntensityBucket[];
  moments?: IntenseMoment[];
  runtimeMinutes?: number;
  viewerCount?: number;
};

function getPosition(ms: number, runtimeMinutes?: number) {
  const runtimeMs = runtimeMinutes ? runtimeMinutes * 60 * 1000 : undefined;
  const denominator = runtimeMs && runtimeMs > 0 ? runtimeMs : 3_600_000;
  return Math.min(100, Math.max(0, (ms / denominator) * 100));
}

export function Timeline({
  buckets,
  moments = [],
  runtimeMinutes,
  viewerCount = 0,
}: TimelineProps) {
  if (!buckets.length) {
    return (
      <div className="empty-state">
        <p>No biometric curve yet.</p>
      </div>
    );
  }

  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.intensityScore), 0);
  const average = Math.round(
    buckets.reduce((sum, bucket) => sum + bucket.intensityScore, 0) / buckets.length,
  );
  const readableBuckets = [...buckets]
    .sort((left, right) => right.intensityScore - left.intensityScore)
    .slice(0, 6)
    .sort((left, right) => left.bucketStartMs - right.bucketStartMs);

  return (
    <div className="signal-board">
      <div className="signal-board__summary">
        <div>
          <span>Peak intensity</span>
          <strong>{peak}</strong>
        </div>
        <div>
          <span>Typical intensity</span>
          <strong>{average}</strong>
        </div>
        <div>
          <span>Screenings</span>
          <strong>{viewerCount || 1}</strong>
        </div>
      </div>

      <div className="signal-legend" aria-label="Intensity scoring legend">
        <span>0-41 calm</span>
        <span>42-66 rising</span>
        <span>67-84 spike</span>
        <span>85-100 peak</span>
      </div>

      <div className="cinema-timeline" aria-label="Biometric intensity curve">
        <div className="timeline-axis">
          <span>opening</span>
          <span>midpoint</span>
          <span>final act</span>
        </div>
        <div className="curve-track">
          {buckets.map((bucket) => (
            <span
              className={`curve-pulse ${classifyIntensity(bucket.intensityScore)}`}
              key={bucket.bucketStartMs}
              style={{
                height: `${Math.max(10, bucket.intensityScore)}%`,
                left: `${getPosition(bucket.bucketStartMs, runtimeMinutes)}%`,
              }}
              title={`${formatDuration(bucket.bucketStartMs)}: intensity ${bucket.intensityScore}`}
            />
          ))}
          {moments.slice(0, 4).map((moment) => (
            <span
              className="peak-pin"
              key={moment.bucketStartMs}
              style={{ left: `${getPosition(moment.bucketStartMs, runtimeMinutes)}%` }}
              title={`${moment.label}: ${moment.intensityScore}/100`}
            />
          ))}
        </div>
      </div>

      <div className="timeline-readout" aria-label="Highest intensity windows">
        {readableBuckets.map((bucket) => (
          <div className={`timeline-row band-${classifyIntensity(bucket.intensityScore)}`} key={bucket.bucketStartMs}>
            <span className="muted mono">{formatDuration(bucket.bucketStartMs)}</span>
            <div className="timeline-bar" title={`Intensity ${bucket.intensityScore}`}>
              <div
                className="timeline-fill"
                style={{ width: `${Math.max(bucket.intensityScore, 4)}%` }}
              />
            </div>
            <span className="mono">{bucket.intensityScore}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MomentList({ moments }: { moments: IntenseMoment[] }) {
  if (!moments.length) {
    return (
      <div className="empty-state">
        <p>No ranked moments yet.</p>
      </div>
    );
  }

  return (
    <ul className="moment-list">
      {moments.map((moment) => (
        <li className="moment" key={moment.bucketStartMs}>
          <div>
            <div>{moment.label}</div>
            <div className="muted mono">{formatDuration(moment.bucketStartMs)}</div>
          </div>
          <div>
            <div className="mono">{moment.intensityScore}/100</div>
            <div className="muted">{moment.viewerCount} viewers</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
