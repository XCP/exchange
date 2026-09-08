# Interrupted event-page reads

On September 8, 2026, a production tail captured scheduled `Network connection lost.` exceptions while `fetchBlockEvents` awaited the response body's JSON. The last good checkpoint stayed behind the upstream tip; some later invocations recovered without a code change. This is an interrupted transport read, not evidence of an invalid blockchain event or ledger corruption.

The indexer now retries the same read-only event page once after 250 ms for the observed workerd transport error and equivalent fetch/terminated errors. It accepts neither events nor the next cursor until the complete JSON body has been read. Successful pages are retained, so a dropped later page does not restart the block or the complete scheduled invocation. Each request retains its existing 15-second timeout.

HTTP errors (including 429), malformed JSON and application errors still fail immediately. A persistent transport failure propagates after the second attempt. Existing block-hash verification, checkpoint ordering, atomic LP event effects and lock release remain in place. This retry can recover a brief connection interruption; it cannot repair a sustained upstream outage.

The SQLite replay test reproduces the captured error with a response that sends a JSON prefix and then fails. On a two-page block, the previous implementation needed a second sync invocation: 14 fetches and 43 SQL statement executions. The page retry completes with 9 fetches and 32 SQL statement executions, without duplicating either LP credit. These are deterministic local fault-injection measurements, not production billing savings. A persistent failure costs one additional upstream read; the retry is deliberately limited to one.

Validation covers same-cursor recovery, exact LP balances and event counts, retry exhaustion with an unchanged checkpoint, released locks, and no immediate retry for HTTP throttling or invalid JSON. The existing replay, migration and Worker runtime suites also pass.
