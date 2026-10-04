# Replay integrity

## Failure paths

- A block height could commit before its hash, making a later crash look like a reorg.
- Replaying an LP event ignored its duplicate history row but added its balance delta again.
- Retry fee allocation and snapshots could include already-applied block deltas twice.
- LP history rebuild assumed an opening balance of zero, although retained history is incomplete.
- Rollback could delete the affected rows and crash before rebuilding their derived stats.

These are application indexer defects, not Counterparty consensus changes.

## Fix

Migration `0051_replay_integrity.sql` makes each LP event insertion/deletion and its balance effect
one SQLite statement. Duplicate event inserts have no second effect. Removing an orphan event
subtracts only its delta, preserving the opening balance. Negative incoming results fail atomically.

On a partial-block retry, one indexed query recovers already-applied deltas for that block. Fee
allocation and snapshots use the opening balance, including holders already debited to zero.
No full-history reconstruction is used in the normal path or automatic LP rollback.

Height, hash and time checkpoint together. Only 25 recent checkpoints are retained. Reorgs require
a verified common ancestor; insufficient history stops for operator recovery instead of guessing.
An interrupted block records its hash before writes. An interrupted rollback retains its affected
identities until all repairs finish. Pending derived stats also survive a committed cursor.

Block and parent hashes are checked before writes so catch-up cannot silently join different branches.

## Cost

- No recurring balance audit, full ledger sum or global balance rewrite.
- LP retry lookup seeks `idx_pool_lp_events_block`; balance changes use the primary key.
- Existing LP event and balance writes become atomic trigger effects, not additional copies.
- A small checkpoint history and pending-work records add bounded writes per applied block.
- Additional block-header checks trade a few source requests for explicit chain consistency.
- Post-processing resumes only touched pools, pairs and assets.

## Release procedure

**Do not apply this trigger migration while the old indexer is writing.** The old code applies an
additional standalone delta. Pause `indexer_mode` with the sync lease held, run green checks, apply
the migration and deploy the API, verify the deployed revision, then restore `FOLLOWING` and release
the lease. HTTP reads remain available during the pause. The short block backlog catches up normally.

Rolling back to the old writer requires the same pause and removal of the new LP event triggers.
Do not deploy the old writer against enabled triggers.

## Coverage and limitations

`tests/replay-integrity.test.ts` runs real migrations and transactions, injected batch failures, duplicate
events, missing opening history, zero balances, fee ordering, pending forks, interrupted rollback,
post-processing recovery, mid-catch-up forks and checkpoint failure through the real sync function.

The first production census found 69 LP balance rows and 97 retained LP events. Eleven burn-address
balances exceed retained history by the same amount. Two checked against Core match the current
stored balances exactly, confirming that zero-based reconstruction would be unsafe. No production
LP balances were changed by this investigation. A full source audit is still separate work.

Migration `0053_reorg_undo.sql` records exact before-images for block replay mutations of orders,
dispensers and pools. Context and writes share a transaction; inverse writes and journal deletion
also share a transaction. Partial fills, closing status 11 and remaining quantities are restored,
without closure-time guesses. Existing LP inverse triggers and derived-state rebuilds remain.

The journal retains 24 blocks and starts at the deployment checkpoint. A fork below that floor
stops before deleting branch data; rebuild from a verified baseline is required. Apply migration
0053 before deploying this writer. Snapshot/admin rebuilds must run with the block writer paused;
they establish a new baseline and must reset the undo journal/floor to that verified checkpoint.
Keep the generated trigger column lists in sync when changing these tables.

Every Counterparty indexer read uses a fresh URL, including continuation pages and retry attempts.
A repeated scalar `verbose` parameter preserves Core's first-value semantics while changing its
URL cache key. Block acceptance also compares the new header's actual `previous_block_hash` with
the applied hash. This trusts the configured Core provider; it is not an independent Bitcoin oracle.
