import { dec } from "../lib/market-summary";

const MAX_WINDOW_SECONDS = 31 * 86400;

export const DEFILLAMA_TRADE_VOLUME_SQL = `
  SELECT quote_asset, source_type AS source,
         COALESCE(SUM(volume), 0) AS volume, COUNT(*) AS trades
  FROM trades
  WHERE block_time >= ? AND block_time < ?
    AND quote_asset IN ('BTC', 'XCP')
    AND pair NOT IN (SELECT pair FROM pair_stats WHERE hidden = 1)
  GROUP BY quote_asset, source_type`;

// A shared BTC payment can trigger multiple dispensers and is copied onto
// every dispense row. Use the dispenser's protocol unit price, not btc_amount,
// so the payment is never multiplied across assets or inflated by overpayment.
export const DEFILLAMA_DISPENSER_VOLUME_SQL = `
  SELECT 'BTC' AS quote_asset, 'dispenser' AS source,
         COALESCE(SUM(d.dispense_quantity * COALESCE(p.price, d.price)), 0) AS volume,
         COUNT(*) AS trades
  FROM dispenses d
  LEFT JOIN dispensers p ON p.tx_hash = d.dispenser_tx_hash
  WHERE d.block_time >= ? AND d.block_time < ?
    AND d.asset NOT IN (SELECT asset FROM dispenser_stats WHERE hidden = 1)`;

interface VolumeRow {
  quote_asset: "BTC" | "XCP";
  source: "order" | "pool" | "dispenser";
  volume: number;
  trades: number;
}

function requiredTimestamp(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name);
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export async function handleDefiLlamaVolume(request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url);
  const startTimestamp = requiredTimestamp(url, "start_timestamp");
  const endTimestamp = requiredTimestamp(url, "end_timestamp");

  if (startTimestamp == null || endTimestamp == null) {
    return Response.json(
      { error: "start_timestamp and end_timestamp are required unix seconds" },
      { status: 400 }
    );
  }
  if (endTimestamp <= startTimestamp) {
    return Response.json({ error: "end_timestamp must be greater than start_timestamp" }, { status: 400 });
  }
  if (endTimestamp - startTimestamp > MAX_WINDOW_SECONDS) {
    return Response.json({ error: "time window cannot exceed 31 days" }, { status: 400 });
  }

  const indexedTime = await db.prepare(
    `SELECT value FROM indexer_state WHERE key = 'last_block_time'`
  ).first<{ value: string }>();
  const indexedThrough = Number(indexedTime?.value);
  if (!Number.isFinite(indexedThrough) || indexedThrough < endTimestamp) {
    return Response.json(
      {
        error: "requested window is not finalized by the indexer",
        indexed_through: Number.isFinite(indexedThrough) ? indexedThrough : null,
      },
      { status: 503, headers: { "Retry-After": "600" } }
    );
  }

  const [tradeResult, dispenserResult] = await db.batch([
    db.prepare(DEFILLAMA_TRADE_VOLUME_SQL).bind(startTimestamp, endTimestamp),
    db.prepare(DEFILLAMA_DISPENSER_VOLUME_SQL).bind(startTimestamp, endTimestamp),
  ]);
  const rows = [
    ...(tradeResult.results as unknown as VolumeRow[]),
    ...(dispenserResult.results as unknown as VolumeRow[]),
  ].filter((row) => row.trades > 0);

  const totals = { BTC: 0, XCP: 0 };
  const breakdown = { order: { BTC: 0, XCP: 0 }, pool: { BTC: 0, XCP: 0 }, dispenser: { BTC: 0, XCP: 0 } };
  let tradeCount = 0;
  for (const row of rows) {
    totals[row.quote_asset] += row.volume;
    breakdown[row.source][row.quote_asset] += row.volume;
    tradeCount += row.trades;
  }

  const serialize = (value: { BTC: number; XCP: number }) => ({ BTC: dec(value.BTC), XCP: dec(value.XCP) });
  const now = Math.floor(Date.now() / 1000);
  const cache = endTimestamp <= now - 86400
    ? "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400"
    : "public, max-age=300, s-maxage=3600";
  return Response.json(
    {
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp,
      window_semantics: "start inclusive, end exclusive",
      volume_by_quote: serialize(totals),
      volume_by_source: {
        order_book: serialize(breakdown.order),
        amm_pool: serialize(breakdown.pool),
        dispenser: serialize(breakdown.dispenser),
      },
      trade_count: tradeCount,
    },
    { headers: { "Cache-Control": cache } }
  );
}
