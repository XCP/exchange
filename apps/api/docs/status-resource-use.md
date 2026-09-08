# Status counter reads

An origin `/status` request previously ran seven table counts, even when another Cloudflare location had just counted the same tables. A production measurement on September 8, 2026 read 1,047,832 rows for those seven statements alone, taking 353.6 ms of summed D1 query time.

The counters now share one fixed `status/counts/v1` entry in the existing `analytics_response_cache` table. All hosts and ignored query parameters use the same entry. Counters retain their existing five-minute maximum age; a shared hit receives only its remaining lifetime as its edge/browser TTL. Indexer mode, checkpoint, heartbeat age and readiness are rebuilt from current `indexer_state` for every origin response. Failed cache reads/writes fall back to ordinary counting, while database failures are still reported as failures.

No migration or periodic cache-refresh job is required. Expired counters refresh on demand. Concurrent cold origin requests may still duplicate a refresh; they do not share request-bound promises across Worker invocations. Warm status handling needs one cache point lookup and the small indexer-state read, with no cache write. Cache contents are projected onto the seven expected numeric fields so unexpected fields cannot override live readiness.

Validation includes real SQLite response/expiry/failure tests and the deployed Worker entrypoint under workerd. With seven 1,000-row fixture tables, real D1 reports 7,000 counter rows read before sharing and four total read rows on a warm origin call. Ten sequential origin requests run seven count statements instead of seventy. Counter changes appear after expiry; heartbeat and mode changes appear on the next origin request. These fixture measurements and one production baseline are not whole-account billing forecasts.

`X-Status-Counts-Cache` identifies whether the origin response used shared counters. Existing edge responses can retain a MISS value from the response they cached; use a new harmless query parameter when specifically checking the origin path.
