const PRICE_URL = "https://api.xcp.io/v2/price";

export interface UsdAnchors {
  XCP: number | null;
  BTC: number | null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Parse only the two independently published quote anchors used by pools. */
export function parseUsdAnchors(body: unknown): UsdAnchors {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { XCP: null, BTC: null };
  }
  const result = (body as { result?: unknown }).result;
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { XCP: null, BTC: null };
  }
  const prices = result as { xcp?: { usd?: unknown }; btc?: { usd?: unknown } };
  return {
    XCP: positiveNumber(prices.xcp?.usd),
    BTC: positiveNumber(prices.btc?.usd),
  };
}

/**
 * Current USD anchors from the explorer price service already used by the
 * exchange and launchpad. Cloudflare caches the shared upstream response for
 * ten minutes; a missing anchor is returned as null and never fabricated.
 */
export async function fetchUsdAnchors(): Promise<UsdAnchors> {
  try {
    const response = await fetch(PRICE_URL, {
      signal: AbortSignal.timeout(6_000),
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    if (!response.ok) return { XCP: null, BTC: null };
    return parseUsdAnchors(await response.json());
  } catch {
    return { XCP: null, BTC: null };
  }
}
