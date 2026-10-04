# Dispenser state recovery

`DISPENSER_UPDATE` is a partial update. A delayed close has `status: 10` and
`give_remaining: 0`, but no `dispense_count`. Applying the remaining quantity
only when the count is also supplied leaves stale inventory. Apply each
provided field independently; preserve omitted quantities and counts. An open
update clears a previous closing timestamp. Exact undo still restores the
complete prior row when the update's block is orphaned.

The 2026-10-04 read-only audit compared the complete open, empty-address and
closing non-oracle sets at block 969895. Exchange had 26,064 rows and Core
26,060. Four stored closing dispensers are canonically closed. One GREYSCALE
dispenser still has four remaining units/count zero, versus three/count one in
Core. Its canonical dispense at block 956715 is also missing locally.

Thirty-two price differences are differences between API normalization and
division of the same offer rate/quantity. Preserve them during this repair.
Creation block/time and Core last-update block/time have different meanings;
the 670 metadata differences are not instructions to overwrite creation data.

The partial-update defect is reproducible in current code. It does not explain
why all five historical updates were missed, and this audit does not establish
a reorg as their cause.

Repair the four closed statuses/remaining quantities and the GREYSCALE
remaining/count only after verifying fresh canonical source records and their
original transaction/block identities. Include the missing complete GREYSCALE
dispense transaction, its payment allocation and dependent asset statistics;
do not fix inventory while leaving its history inconsistent. Verify the
complete GREYSCALE asset dispense history before deriving those statistics.

Use a recovery bookmark, scoped before-images, owned writer locks and guarded
old/new values. Rehearse wrong-owner, stale-checkpoint, changed-before-image,
partial-failure and repeat cases in SQLite. Preserve transaction-creation
metadata, prices, unrelated dispenses, signatures and economic actions.
Verify the entire current dispenser set after repair, then resume and observe
canonical indexing. This code change does not automatically rewrite history.
