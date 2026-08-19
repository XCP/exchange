/** Abort signal timeout for Counterparty API requests (ms) */
export const API_TIMEOUT_MS = 15000;

/** Advisory lock staleness threshold (seconds). Longer than the Worker's
 * 300-second CPU allowance so a two-minute cron tick cannot steal a lease
 * from an invocation that is still processing a dense block. */
export const LOCK_TIMEOUT_SECONDS = 15 * 60;

/** Safety ceiling for cursor pagination loops */
export const MAX_PAGINATION_PAGES = 500;

/** OHLCV candle interval sizes in seconds (used for fixed-step intervals) */
export const INTERVAL_SECONDS: Record<string, number> = {
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
  "1m": 2592000, // approximate — calendar-aligned via calendarBucket
  "1y": 31536000, // approximate — calendar-aligned via calendarBucket
};

export const ALL_INTERVALS = Object.keys(INTERVAL_SECONDS);

/** Calendar-aligned intervals that snap to month/year boundaries */
export const CALENDAR_INTERVALS = new Set(["1m", "1y"]);

/** Snap a unix timestamp to the start of its calendar bucket (month or year) */
export function calendarBucket(unixSeconds: number, interval: string): number {
  if (interval === "1y") {
    const d = new Date(unixSeconds * 1000);
    return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
  }
  if (interval === "1m") {
    const d = new Date(unixSeconds * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  }
  // Fixed-step intervals — floor to interval boundary
  const step = INTERVAL_SECONDS[interval];
  return Math.floor(unixSeconds / step) * step;
}

/** Advance a bucket timestamp to the next bucket */
export function nextBucket(timestamp: number, interval: string): number {
  if (interval === "1y") {
    const d = new Date(timestamp * 1000);
    return Date.UTC(d.getUTCFullYear() + 1, 0, 1) / 1000;
  }
  if (interval === "1m") {
    const d = new Date(timestamp * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  }
  return timestamp + INTERVAL_SECONDS[interval];
}

/** Step a bucket timestamp backward by one bucket */
export function prevBucket(timestamp: number, interval: string): number {
  if (interval === "1y") {
    const d = new Date(timestamp * 1000);
    return Date.UTC(d.getUTCFullYear() - 1, 0, 1) / 1000;
  }
  if (interval === "1m") {
    const d = new Date(timestamp * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) / 1000;
  }
  return timestamp - INTERVAL_SECONDS[interval];
}

/** Count how many buckets from start to end (inclusive) */
export function countBuckets(start: number, end: number, interval: string): number {
  if (CALENDAR_INTERVALS.has(interval)) {
    let count = 0;
    let ts = start;
    while (ts <= end) {
      count++;
      ts = nextBucket(ts, interval);
    }
    return count;
  }
  const step = INTERVAL_SECONDS[interval];
  return Math.floor((end - start) / step) + 1;
}

/** SQL expression that computes the bucket timestamp for a given interval */
export function sqlBucketExpr(interval: string): string {
  if (interval === "1y")
    return `CAST(strftime('%s', strftime('%Y', block_time, 'unixepoch') || '-01-01') AS INTEGER)`;
  if (interval === "1m")
    return `CAST(strftime('%s', strftime('%Y-%m', block_time, 'unixepoch') || '-01') AS INTEGER)`;
  const step = INTERVAL_SECONDS[interval];
  return `(block_time / ${step}) * ${step}`;
}

/** SQL expression for partitioning rows by time bucket (used in window functions) */
export function sqlPartitionExpr(interval: string): string {
  if (interval === "1y") return `strftime('%Y', block_time, 'unixepoch')`;
  if (interval === "1m") return `strftime('%Y-%m', block_time, 'unixepoch')`;
  const step = INTERVAL_SECONDS[interval];
  return `(block_time / ${step}) * ${step}`;
}

/** Walk backward N buckets from a starting timestamp */
export function walkBack(from: number, interval: string, count: number): number {
  if (CALENDAR_INTERVALS.has(interval)) {
    let ts = from;
    for (let i = 0; i < count; i++) {
      ts = prevBucket(ts, interval);
    }
    return ts;
  }
  return from - count * INTERVAL_SECONDS[interval];
}
