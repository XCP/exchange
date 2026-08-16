import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

/**
 * R2-backed incremental cache.
 *
 * Without an `incrementalCache` override the adapter resolves to a "dummy"
 * cache and nothing persists: every `export const revalidate` is silently
 * ignored and each request re-runs the full render cold. This config was
 * `defineCloudflareConfig({})` until 2026-08-16, and the symptom was visible
 * from outside — three consecutive requests to the same URL:
 *
 *   xcpdex.com   MISS  MISS  MISS     <- nothing was ever stored
 *   xcp.io       HIT   HIT   HIT      <- explorer, configured
 *   xcp.fun      STALE STALE STALE    <- launchpad, configured
 *
 * `MISS` on every request to one URL is the dummy-cache signature: there is
 * no stored render to serve, so the next request starts over.
 *
 * The binding name `NEXT_INC_CACHE_R2_BUCKET` in wrangler.toml is fixed by
 * this override — renaming it turns caching back off silently.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
