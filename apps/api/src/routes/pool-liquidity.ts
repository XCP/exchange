import { calendarBucket, nextBucket } from "../lib/constants";
import { cacheControl } from "../utils/cache";
import { resolveWindow, VALID_INTERVALS } from "./ohlc";

/**
 * A pool's reserves over time.
 *
 * `pool_updates` already records both reserves at every event that moves them
 * — swaps, deposits, withdrawals — so the series exists in the table and only
 * needed a route in front of it.
 *
 * Reserves are a LEVEL, not a flow, and that changes both halves of the
 * bucketing. Within a bucket the last event wins rather than the sum, because
 * a pool that was swapped five times holds whatever it holds at the end, not
 * the total of five readings. Across an empty bucket the previous value
 * carries forward rather than reading zero, because an hour with no swaps is
 * an hour where the liquidity simply sat there. Volume works the opposite way
 * on both counts, which is why this isn't the OHLC roll-up with a rename.
 *
 * Both reserves are returned rather than a single TVL. For a constant-product
 * pool the two sides are equal in value at the pool's own price, so a caller
 * that wants TVL in quote terms takes double the quote reserve — but which
 * asset is the quote is a display question, and answering it here would bake
 * one denomination into the data.
 */

/** Defensive ceiling; the busiest pool has far fewer events than this. */
const MAX_ROWS = 50_000;

interface UpdateRow {
  block_time: number;
  reserve_a: number;
  reserve_b: number;
}

interface Point {
  t: number;
  a: number;
  b: number;
}

export async function handlePoolLiquidity(
  request: Request,
  db: D1Database,
  lpAsset: string
): Promise<Response> {
  const url = new URL(request.url);
  const interval = url.searchParams.get("interval");
  if (!interval || !VALID_INTERVALS.has(interval)) {
    return Response.json(
      { error: "interval required: 1h, 4h, 1d, 1w, 1m, 1y" },
      { status: 400 }
    );
  }

  const asset = lpAsset.toUpperCase();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "90", 10) || 90,
    500
  );
  const { windowStart, windowEnd } = resolveWindow(url, interval, limit);

  const [meta, rowsResult, seedResult] = await Promise.all([
    db
      .prepare(`SELECT lp_asset, pair, asset_a, asset_b FROM pools WHERE lp_asset = ?`)
      .bind(asset)
      .first<{ lp_asset: string; pair: string; asset_a: string; asset_b: string }>(),
    db
      .prepare(
        `SELECT block_time, reserve_a, reserve_b
         FROM pool_updates
         WHERE lp_asset = ? AND block_time >= ? AND block_time < ?
         ORDER BY block_index ASC, event_index ASC
         LIMIT ?`
      )
      // `windowEnd` is the last bucket's START, so the scan runs to the start
      // of the bucket after it or the newest events fall outside the window.
      .bind(asset, windowStart, nextBucket(windowEnd, interval), MAX_ROWS)
      .all<UpdateRow>(),
    // The level the pool was already sitting at when the window opened. Without
    // this a pool that simply wasn't touched recently would chart as empty.
    db
      .prepare(
        `SELECT reserve_a, reserve_b FROM pool_updates
         WHERE lp_asset = ? AND block_time < ?
         ORDER BY block_index DESC, event_index DESC LIMIT 1`
      )
      .bind(asset, windowStart)
      .first<{ reserve_a: number; reserve_b: number }>(),
  ]);

  if (!meta) {
    return Response.json({ error: "pool not found" }, { status: 404 });
  }

  // Last event in each bucket wins — see the note above on levels vs flows.
  const byBucket = new Map<number, Point>();
  for (const r of rowsResult.results) {
    const t = calendarBucket(r.block_time, interval);
    byBucket.set(t, { t, a: r.reserve_a, b: r.reserve_b });
  }

  const points: Point[] = [];
  let last: Point | null = seedResult
    ? { t: windowStart, a: seedResult.reserve_a, b: seedResult.reserve_b }
    : null;
  for (let t = windowStart; t <= windowEnd; t = nextBucket(t, interval)) {
    const real = byBucket.get(t);
    if (real) {
      points.push(real);
      last = real;
    } else if (last) {
      points.push({ t, a: last.a, b: last.b });
    }
    // Before the pool's first event there is no level to carry, so those
    // leading buckets are omitted rather than drawn as zero liquidity.
  }

  return Response.json(
    {
      lp_asset: meta.lp_asset,
      pair: meta.pair,
      asset_a: meta.asset_a,
      asset_b: meta.asset_b,
      interval,
      points,
    },
    { headers: { "Cache-Control": cacheControl(url, 60) } }
  );
}
