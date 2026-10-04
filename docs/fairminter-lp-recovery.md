# Fairminter LP credit recovery

Fairminter resolution creates a pool at the end of a block. Its LP `CREDIT`
has `tx_hash: null` on the event envelope and the original fairminter transaction
hash in `params.event`. Passing the null envelope hash to the LP history insert
caused `INSERT OR IGNORE` to discard the row because `tx_hash` is NOT NULL.
The balance trigger consequently never ran. This is an ingestion defect;
the audit does not attribute it to a past reorganization.

Use the originating hash from `params.event` when the envelope hash is absent.
Reject an unidentified LP event before checkpointing. Preserve the original
event index and credit block, so retries and rollback retain their existing
identity and ordering rules. The regression exercises a credit preceding
`OPEN_POOL`, a failed post-processing retry, and replacement of that block.

## Read-only audit, 2026-10-04

At block 969891, complete pool identity/reserve comparisons and all 2,505 pool
match economic records agreed with fresh Core reads. The stored checkpoint
matched Core and an independent Bitcoin hash source. Local pool and LP balance
rows remained unchanged over the comparison.

All 55 positive local LP balances agreed. Eight additional Core balances were
missing, each at `1CounterpartyXXXXXXXXXXXXXXXUWLpVr`, holding
14,625,320,509,308 raw LP units. These are permanently locked fairminter LP
tokens; they still belong in the total supply used for holder share accounting.

The affected pools are FAKEBANG/XCP, GOOBY/XCP, LORDFUN/XCP, FEWGOODMAN/XCP,
JAPANESENFT/XCP, MAJORLOWERY/XCP, DANFUNPILL/XCP and XCP/XCPISFOREVER.
Their complete canonical credit/debit histories comprise 17 stored events and
the eight omitted credits. Replaying these histories reaches Core's current
balances. The eight pools have 596 indexed swaps. Recomputing holder fee shares
with the locked supply proposes correcting 190 existing fee records and adding
596 locked-holder records. These are derived analytics, not payments.

## Historical repair sequence

The preventive code change does not repair old rows automatically.

1. Deploy the preventive fix and verify scheduled indexing. Capture a fresh D1
   Time Travel bookmark, affected-table before-images and the app/source anchor.
2. Refresh the eight complete asset ledgers and balances, verify event ordering
   against canonical event indexes, and recheck block, ledger and messages hashes.
   Treat a failed or incomplete source read as unresolved.
3. Rehearse the exact proposed changes in an isolated SQLite copy. Test stale
   before-images, wrong lock ownership, partial failure and repeated execution.
   Include normalized fee amounts, fee totals and retained balance snapshots.
4. Acquire owned cron/sync locks and confirm no pending block, rollback or
   post-processing work. Apply guarded inserts for the eight original credits.
   Let the existing history trigger update balances; do not also add the same
   quantities manually. Preserve the source event indexes and original heights.
5. Apply the reviewed fee corrections and rebuild only the affected holder fee
   totals and coherent balance snapshots. Preserve reserves, deposits,
   withdrawals, swaps and all economic actions.
6. Recheck complete current balances, replayed fee shares and aggregates.
   Repeating the proposal must produce no changes. Release only owned locks,
   observe scheduled canonical sync, and retain restoration receipts.

No historical production rows were changed during this audit. The other 33
pools' full LP history, dispenser history and wider Exchange projections remain
separate audit scopes.
