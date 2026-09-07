# Exchange atomic PSBT retirement

PSBT trading belongs to DigiRare Marketplace. Exchange's unused atomic trading implementation is retired, without a signing redesign or plan to restore it here.

All `/atomic` paths show a retirement notice and Marketplace link. The portfolio no longer offers an Exchange atomic listing action. Former listing, fill and cancellation mutation APIs return HTTP 410 with `atomic_trading_retired`, including already-pending fill submissions. PSBT construction, signing/fill pages, merge/broadcast helpers, signature verification helpers, and the old fill monitor were removed. No migration or data deletion is included; historical listing GET APIs remain readable and continue to exclude stored PSBTs. Marketplace code and data are untouched.

The audit also found a delivery mismatch in the old implementation: at Counterparty Core `67e10db3ee266068c1effc4e83653df39ace5ca8`, `counterparty-core/counterpartycore/lib/parser/gettxinfo.py` lines 481–492 select the first non-OP_RETURN output for spent UTXO assets; lines 525–536 apply that destination. The retired buyer construction paid the seller at output 0 and put the intended buyer asset carrier at output 1. Removing the unsupported Exchange flow avoids retaining or extending that scheme.
