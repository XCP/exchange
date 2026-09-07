# Amount and transaction boundaries

Exchange's transaction fields use the additive `@xcp/wallet-sdk/amounts` contract, pinned to immutable SDK commit `79f190308d4b60cc3ec9023beada21e0ee776213`. The API uses its standalone CommonJS entry for the existing compiled test runner. Both packages use the same parser; there is no local copy of the numeric grammar.

The protocol review was based on Counterparty Core `67e10db3ee266068c1effc4e83653df39ace5ca8`, including `lib/api/compose.py`, `lib/parser/composer.py`, and the order, dispenser, attach, pooldeposit and poolwithdraw message definitions. Raw quantities are integers bounded by Core's signed 64-bit maximum. Precision belongs to each asset: zero decimals for an indivisible token, eight for a divisible token, and eight for LP tokens. Unknown divisibility disables the transaction.

Transaction drafts are canonical ASCII decimals, independent of browser locale. They retain the complete typed, pasted or dropped text. A comma, sign, exponent, second decimal point, excess precision or incomplete trailing decimal blocks quote/compose rather than removing characters. A native single-line input cannot display line breaks; paste/drop retain those characters in the draft and show an invalid-field error. Correction or an explicit preset changes the draft. Dispenser purchases require accepting a whole-lot amount before paying for a smaller quantity.

Raw quantities cross quote and compose boundaries as exact digit strings. Prices multiply human quantities once; a buy spend ceiling rounds down and a sell receive minimum rounds up. Slippage uses decimal arithmetic before flooring the derived raw minimum. Percentage presets preserve indivisible integer zeros. Exact authorization rows show the amounts that are composed. Order-book give/get and remaining amounts use their own raw asset ID and divisibility, including subassets and non-XCP quotes. Display strings with grouping are separate from ungrouped preset values.

Fee rate, expiry and slippage have different field rules. Fractional sat/vB fees remain fractional; expiry is an integer from 1 through 8064 blocks; the app's custom slippage range is 0.01–50%. Invalid settings remain visible and block the form. Only valid settings persist. The conservative expiry limit is valid before and after Core's indefinite-orders activation.

Swap and pool submission reconfirm the quote and abort on failure or changed account/assets/amount/settings. A refetch cannot lower the reviewed swap minimum. Pool withdrawal minima map by asset name when the displayed leg order differs from Core's. The generic Counterparty relay validates raw quote and field-aware compose parameters too; it forwards response bytes without re-encoding quantities.

Atomic listings explicitly use raw inventory units and must match the entire UTXO. The server reads raw quantities losslessly and derives the display amount using that asset's divisibility. It no longer accepts `Number`-coerced price/vout strings or silently substitutes a different inventory quantity. The seller checks its selected input, sighash, seller payment address and exact price before signing. Atomic purchases are temporarily disabled because the existing output ordering sends attached assets back to the seller; see [the release blocker](atomic-purchase-release-blocker.md). Restoring purchases needs separate Core parsing and wallet signing fixtures.

## Verification

- `npm run check --workspace apps/web`: TypeScript, shared vectors, sequential production component interactions, wrong/stale metadata, raw quote/compose serialization, relay bypasses, and custom atomic policy tests.
- `npm run lint:amounts --workspace apps/web`: changed transaction source and test lint. The existing full `npm run lint --workspace apps/web` has eight errors in unrelated atomic/explore pagination, analytics, and search components; this patch does not suppress those rules.
- `npm test --workspace apps/api`: existing API/replay suite plus exact atomic inventory, raw API validation, and prepare/complete purchase guards.
- `npm run test:e2e --workspace apps/web`: real Chromium typing and clipboard tests on the actual Next amount fields for `en-US`, `de-DE`, `fr-FR`, `es-VE`, `ja-JP`, and `zh-CN`, using only fixture API reads and no connected wallet.
- `npm run build --workspace apps/web`: production compilation and route generation.

The tests never broadcast a transaction. Real wallet/mainnet confirmation is outside this patch. Analytics/indexer display tables retain their existing normalized numeric models; their approximate values are not a replacement for exact raw quantities at a transaction boundary.
