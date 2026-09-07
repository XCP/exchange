# Atomic purchase delivery release blocker

Atomic purchases are disabled in the browser, direct transaction constructor, and HTTP prepare/complete routes. Existing listings remain visible. This is a deliberate release hold; the patch does not claim to repair or verify the complete atomic swap signing scheme.

At locally inspected Counterparty Core commit `67e10db3ee266068c1effc4e83653df39ace5ca8`, `counterparty-core/counterpartycore/lib/parser/gettxinfo.py` lines 481–492 select the first non-OP_RETURN output as the destination. Lines 525–536 use it for the balances from spent UTXOs. `messages/utxo.py` line 165 obtains that destination for the transfer. Core tests `test/units/parser/gettxinfo_test.py` lines 272 onward explicitly exercise output selection, including skipping OP_RETURN outputs.

Exchange's existing `constructBuyerPsbt` places the seller's payment at output 0 and the buyer's intended asset carrier at output 1. Both are ordinary Bitcoin outputs. Core therefore sends the purchased asset to the seller's output, while the buyer pays the seller. The code comment identifying output 1 as the asset destination is not evidence of protocol delivery.

The seller template signs input 0/output 0 with SINGLE|ANYONECANPAY. A corrected output ordering must also account for that signature commitment, input index, existing stored templates, merge/finalization, and address families. Simply swapping two outputs is insufficient. Restoring purchases requires a separately reviewed layout with real Core decode/parse and signing fixtures proving delivery to the buyer, exact seller payout, buyer-only signature indices, approved fee recipient/amount and miner fee bounds, clean funding UTXOs, change ownership, unchanged signed outputs, account/quote freshness, and handling of existing listings and pending fills.

The temporary guard executes before coin selection or transaction parsing for direct constructor calls. Tests verify no network call occurs, the actual rendered buy page cannot prepare/sign, and both HTTP routes refuse current/pending fills before state changes.
