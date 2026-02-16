/** Abort signal timeout for Counterparty API requests (ms) */
export const API_TIMEOUT_MS = 15000;

/** Advisory lock staleness threshold (seconds) */
export const LOCK_TIMEOUT_SECONDS = 120;

/** Safety ceiling for cursor pagination loops */
export const MAX_PAGINATION_PAGES = 500;

/** OHLCV candle interval sizes in seconds */
export const INTERVAL_SECONDS: Record<string, number> = {
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
  "1m": 2592000, // 30 days
  "1y": 31536000, // 365 days
};

export const ALL_INTERVALS = Object.keys(INTERVAL_SECONDS);
