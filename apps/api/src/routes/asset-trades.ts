import { cacheControl } from "../utils/cache";

/**
 * Everything that has traded an asset, regardless of pair or venue.
 *
 * The gap this fills: an asset lives in many markets at once — PEPECASH alone
 * has 44 — so per-pair pages fragment its history into as many feeds as it has
 * counter-assets, and none of them is "what happened to this asset". This is
 * that feed.
 *
 * Three sources, unified:
 *   - order-book matches   (`trades`, source_type 'order')
 *   - AMM pool swaps       (`trades`, source_type 'pool')
 *   - dispenser sales      (`dispenses`, always priced in BTC)
 *
 * `trades` already holds both order and pool fills, so the split is a column
 * rather than a join. Dispenses are separate because they are the one venue
 * priced in bitcoin rather than in a counter-asset.
 *
 * SIDE is reported from the ASSET's point of view, which is the whole point of
 * the page this feeds. `trades.side` is relative to `base_asset`, so a row
 * where the asset is the QUOTE has to be flipped: someone buying PEPECASH with
 * XCP is, on the XCP/PEPECASH row, selling XCP.
 *
 * Both indexes this needs already exist — `idx_trades_base_asset`,
 * `idx_trades_quote_asset` and `idx_dispenses_asset_time`, all from the
 * initial migration.
 */

interface FeedRow {
  kind: "order" | "pool" | "dispense";
  block_time: number;
  block_index: number;
  tx_hash: string;
  /** From the asset's perspective. */
  side: "buy" | "sell";
  /** Amount of THIS asset that changed hands. */
  amount: number;
  /** Price in `quote_asset` per unit of this asset. */
  price: number;
  quote_asset: string;
  counterparty: string | null;
  /** Source-table rowid; unique WITHIN a kind, and the pagination tiebreak.
   *  (kind, id) is the stable per-row identity — tx_hash is not, since one
   *  transaction can carry several fills. */
  id: number;
}

export async function handleAssetTrades(
  request: Request,
  db: D1Database,
  name: string
): Promise<Response> {
  const url = new URL(request.url);
  const asset = name.toUpperCase();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  // `venue=dex` or `venue=dispensers` narrows the feed; omitted means all.
  // Validated explicitly rather than inferred: deriving the two flags from
  // `!== "dex"` / `!== "dispensers"` quietly treats any unrecognised value as
  // "all", so a typo'd filter returns MORE than asked for instead of failing.
  const venue = url.searchParams.get("venue");
  if (venue !== null && venue !== "dex" && venue !== "dispensers") {
    return Response.json({ error: "venue must be dex or dispensers" }, { status: 400 });
  }
  const wantTrades = venue !== "dispensers";
  const wantDispenses = venue !== "dex";

  const parts: string[] = [];
  const binds: (string | number)[] = [];

  if (wantTrades) {
    // `side` is stored relative to base_asset; flip it when the asset is the
    // quote so the feed always reads from this asset's side of the trade.
    parts.push(
      `SELECT source_type AS kind, block_time, block_index, tx0_hash AS tx_hash,
              CASE WHEN base_asset = ?
                   THEN side
                   ELSE (CASE side WHEN 'buy' THEN 'sell' ELSE 'buy' END) END AS side,
              CASE WHEN base_asset = ? THEN amount ELSE volume END AS amount,
              CASE WHEN base_asset = ?
                   THEN price
                   ELSE (CASE WHEN price > 0 THEN 1.0 / price ELSE 0 END) END AS price,
              CASE WHEN base_asset = ? THEN quote_asset ELSE base_asset END AS quote_asset,
              taker AS counterparty, id
       FROM trades
       WHERE base_asset = ? OR quote_asset = ?`
    );
    binds.push(asset, asset, asset, asset, asset, asset);
  }

  if (wantDispenses) {
    // A dispense is always the buyer acquiring the asset for BTC. The price
    // is the dispenser's own rate when its row is on file: the stored
    // per-row price carries the FULL payment of a shared multi-dispenser
    // hit, inflated by however many dispensers the payment touched.
    parts.push(
      `SELECT 'dispense' AS kind, block_time, block_index, tx_hash,
              'buy' AS side, dispense_quantity AS amount,
              COALESCE((SELECT dp.price FROM dispensers dp
                         WHERE dp.tx_hash = dispenses.dispenser_tx_hash), price) AS price,
              'BTC' AS quote_asset, destination AS counterparty, id
       FROM dispenses
       WHERE asset = ?`
    );
    binds.push(asset);
  }

  // (kind, id) makes the sort a TOTAL order. Every fill in a block shares
  // block_time AND block_index, so the old sort left whole-block tie groups
  // whose internal order SQLite may pick differently per query — and with
  // OFFSET pagination, differently per PAGE, duplicating or skipping fills
  // across the boundary. `id` also gives clients a stable row key.
  const rows = await db
    .prepare(
      `${parts.join(" UNION ALL ")}
       ORDER BY block_time DESC, block_index DESC, kind ASC, id DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...binds, limit, offset)
    .all<FeedRow>();

  return Response.json(
    { asset, trades: rows.results, limit, offset },
    { headers: { "Cache-Control": cacheControl(url, 30) } }
  );
}
