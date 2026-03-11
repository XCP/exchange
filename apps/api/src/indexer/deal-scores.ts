/**
 * Populates the deal_scores table with pre-computed flip opportunity scores.
 * Each deal IS a buyable listing (open sell order or active dispenser).
 * Multiple deals per asset possible — one per listing.
 *
 * Two passes:
 * A) Open sell orders quoted in XCP/PEPECASH/BITCORN with 3+ trades on the pair
 * B) Active dispensers (BTC-priced) with 3+ dispenses on the asset
 *
 * Processes in batches of 50 to stay within D1 query budgets.
 */

const EXCLUDED_ASSETS = new Set(["XCP", "PEPECASH", "BITCORN", "BTC"]);
const EXCLUDED_ASSETS_SQL = "'XCP','PEPECASH','BITCORN','BTC'";
const SUPPORTED_QUOTES = new Set(["XCP", "PEPECASH", "BITCORN", "BTC"]);
const BATCH_SIZE = 50;
const MIN_TRADES_FOR_DEAL = 3;
const MAX_LISTING_QTY = 10;       // Skip fungible tokens (large qty = not a collectible)

interface OrderListingRow {
  tx_hash: string;
  base_asset: string;
  quote_asset: string;
  source: string;
  price: number;
  give_remaining: number;
  pair: string;
  block_time: number;
}

interface PairStatsRow {
  pair: string;
  base_asset: string;
  quote_asset: string;
  base_asset_longname: string | null;
  last_price: number | null;
  last_trade_time: number | null;
  total_trade_count: number;
  all_time_high: number | null;
  all_time_low: number | null;
  first_trade_time: number | null;
  unique_traders: number;
  bid_count: number;
}

interface TradeRow {
  base_asset: string;
  quote_asset: string;
  price: number;
  amount: number;
  block_time: number;
  side: string;
}

interface DispenserListingRow {
  tx_hash: string;
  asset: string;
  source: string;
  price: number;
  give_remaining: number;
  block_time: number;
}

interface DispStatsRow {
  asset: string;
  last_dispense_price: number | null;
  active_dispensers: number;
  unique_buyers: number;
  total_dispense_count: number;
  first_dispense_time: number | null;
  last_dispense_time: number | null;
  asset_longname: string | null;
}

interface DispenseRow {
  asset: string;
  price: number;
  dispense_quantity: number;
  block_time: number;
}

interface TagRow {
  asset: string;
  slug: string;
  name: string;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeScore(
  avgDaysBetweenTrades: number,
  lastTradeDaysAgo: number,
  discountPct: number | null,
  exitLiquidity: number, // bid_count * 5 + unique_buyers * 0.5
): number {
  let score = 0;
  score += Math.min(30, (1 / Math.max(avgDaysBetweenTrades, 0.1)) * 10);
  score += Math.max(0, 20 - lastTradeDaysAgo * 0.5);
  if (discountPct !== null && discountPct > 0) {
    score += Math.min(30, discountPct * 0.6);
  }
  score += Math.min(20, exitLiquidity);
  return Math.round(score);
}

// ===== INCREMENTAL SCORING (called per-block during sync) =====

/**
 * Score new/changed orders from a single block.
 * Called from syncBlocks() post-processing — only scores affected pairs.
 */
export async function scoreNewOrders(
  db: D1Database,
  affectedPairs: string[],
): Promise<number> {
  if (affectedPairs.length === 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  let scored = 0;

  for (const pair of affectedPairs) {
    // Get pair stats
    const ps = await db
      .prepare(
        `SELECT pair, base_asset, quote_asset, base_asset_longname,
                last_price, last_trade_time, total_trade_count,
                all_time_high, all_time_low, first_trade_time,
                unique_traders, bid_count, hidden
         FROM pair_stats WHERE pair = ?`,
      )
      .bind(pair)
      .first<PairStatsRow & { hidden: number }>();

    if (!ps || ps.hidden || ps.total_trade_count < MIN_TRADES_FOR_DEAL) continue;
    if (EXCLUDED_ASSETS.has(ps.base_asset)) continue;
    if (!SUPPORTED_QUOTES.has(ps.quote_asset)) continue;

    // Only score assets in a collection
    const inCollection = await db
      .prepare(
        `SELECT 1 FROM tag_assets ta
         JOIN tags t ON t.id = ta.tag_id
         WHERE ta.asset = ? AND t.tag_type = 'collection' LIMIT 1`,
      )
      .bind(ps.base_asset)
      .first();
    if (!inCollection) continue;

    // Get recent trades for fair value
    const trades = await db
      .prepare(
        `SELECT price, amount, block_time, side
         FROM (
           SELECT price, amount, block_time, side,
                  ROW_NUMBER() OVER (ORDER BY block_time DESC) as rn
           FROM trades WHERE pair = ?
         ) WHERE rn <= 10`,
      )
      .bind(pair)
      .all<{ price: number; amount: number; block_time: number; side: string }>();

    const prices = trades.results.map((t) => t.price);
    const medianPrice = median(prices);
    if (!medianPrice || medianPrice <= 0) continue;

    // Get ALL open sell orders for this pair
    const orders = await db
      .prepare(
        `SELECT tx_hash, price, give_remaining, source, block_time
         FROM orders
         WHERE pair = ? AND status = 'open' AND side = 'ask'
           AND give_remaining > 0 AND give_remaining < ${MAX_LISTING_QTY}
         ORDER BY price ASC`,
      )
      .bind(pair)
      .all<{ tx_hash: string; price: number; give_remaining: number; source: string; block_time: number }>();

    // Remove stale deal_scores for this pair's orders
    await db
      .prepare(
        `DELETE FROM deal_scores
         WHERE asset = ? AND quote = ? AND listing_type = 'order'`,
      )
      .bind(ps.base_asset, ps.quote_asset)
      .run();

    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    const lastPrice = ps.last_price ?? trades.results[0]?.price ?? medianPrice;
    const recentSales = trades.results.slice(0, 5).map((t) => ({
      price: t.price, amount: t.amount, date: t.block_time, side: t.side,
    }));

    const firstTradeTs = ps.first_trade_time ?? now;
    const daysSinceFirst = Math.max((now - firstTradeTs) / 86400, 1);
    const avgDays = ps.total_trade_count > 1 ? daysSinceFirst / ps.total_trade_count : daysSinceFirst;
    const lastDaysAgo = ps.last_trade_time ? (now - ps.last_trade_time) / 86400 : daysSinceFirst;
    const requiredEdgePct = Math.min(10 + avgDays * 1, 50);

    // Dispenser context
    const dStats = await db
      .prepare(
        `SELECT active_dispensers, unique_buyers, cheapest_price
         FROM dispenser_stats WHERE asset = ?`,
      )
      .bind(ps.base_asset)
      .first<{ active_dispensers: number; unique_buyers: number; cheapest_price: number | null }>();

    // Tags
    const tags = await db
      .prepare(
        `SELECT t.slug, t.name FROM tag_assets ta
         JOIN tags t ON t.id = ta.tag_id
         WHERE ta.asset = ? AND t.tag_type = 'collection'`,
      )
      .bind(ps.base_asset)
      .all<{ slug: string; name: string }>();
    const collections = JSON.stringify(tags.results);

    const upserts: D1PreparedStatement[] = [];

    for (const order of orders.results) {
      if (order.price >= medianPrice) continue;
      const discountPct = Math.round(((medianPrice - order.price) / medianPrice) * 100);
      if (discountPct <= 0) continue;

      const score = computeScore(
        avgDays, lastDaysAgo, discountPct,
        ps.bid_count * 5 + (dStats?.unique_buyers ?? 0) * 0.5,
      );

      upserts.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO deal_scores (
               listing_id, listing_type, asset, quote, asset_longname,
               listing_price, listing_qty, listing_source, listing_block_time,
               fair_value, fair_value_method, discount_pct,
               last_price, highest_price, lowest_price, average_price, median_price,
               recent_sales_json,
               total_trades, avg_days_between_trades, last_trade_days_ago,
               unique_traders, active_buy_orders,
               dispenser_cheapest_btc, dispenser_active, dispenser_unique_buyers,
               score, required_edge_pct, collections_json, updated_at
             ) VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?,?, ?, ?,?,?, ?,?, ?,?,?, ?,?,?,?)`,
          )
          .bind(
            order.tx_hash, "order", ps.base_asset, ps.quote_asset, ps.base_asset_longname,
            order.price, order.give_remaining, order.source, order.block_time,
            medianPrice, `median_${prices.length}`, discountPct,
            lastPrice, ps.all_time_high, ps.all_time_low,
            Math.round(avgPrice * 1e8) / 1e8, medianPrice,
            JSON.stringify(recentSales),
            ps.total_trade_count, Math.round(avgDays * 10) / 10,
            Math.round(lastDaysAgo * 10) / 10,
            ps.unique_traders, ps.bid_count,
            dStats?.cheapest_price ?? null, dStats?.active_dispensers ?? 0, dStats?.unique_buyers ?? 0,
            score, Math.round(requiredEdgePct), collections, now,
          ),
      );
      scored++;
    }

    if (upserts.length > 0) {
      await db.batch(upserts);
    }
  }

  return scored;
}

/**
 * Score new/changed dispensers from a single block.
 * Called from syncBlocks() post-processing — only scores affected assets.
 */
export async function scoreNewDispensers(
  db: D1Database,
  affectedAssets: string[],
): Promise<number> {
  if (affectedAssets.length === 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  let scored = 0;

  for (const asset of affectedAssets) {
    if (EXCLUDED_ASSETS.has(asset)) continue;

    // Only score assets in a collection
    const inCollection = await db
      .prepare(
        `SELECT 1 FROM tag_assets ta
         JOIN tags t ON t.id = ta.tag_id
         WHERE ta.asset = ? AND t.tag_type = 'collection' LIMIT 1`,
      )
      .bind(asset)
      .first();
    if (!inCollection) continue;

    // Get dispenser stats
    const stats = await db
      .prepare(
        `SELECT asset, asset_longname, active_dispensers, unique_buyers,
                total_dispense_count, first_dispense_time, last_dispense_time, hidden
         FROM dispenser_stats WHERE asset = ?`,
      )
      .bind(asset)
      .first<DispStatsRow & { hidden: number }>();

    if (!stats || stats.hidden || stats.total_dispense_count < MIN_TRADES_FOR_DEAL) continue;

    // Get recent dispenses for fair value
    const dispenses = await db
      .prepare(
        `SELECT price, dispense_quantity, block_time
         FROM (
           SELECT price, dispense_quantity, block_time,
                  ROW_NUMBER() OVER (ORDER BY block_time DESC) as rn
           FROM dispenses WHERE asset = ?
         ) WHERE rn <= 10`,
      )
      .bind(asset)
      .all<{ price: number; dispense_quantity: number; block_time: number }>();

    const prices = dispenses.results.map((d) => d.price);
    const medianPrice = median(prices);
    if (!medianPrice || medianPrice <= 0) continue;

    // Get ALL active dispensers for this asset
    const activeDisps = await db
      .prepare(
        `SELECT tx_hash, price, give_remaining, source, block_time
         FROM dispensers
         WHERE asset = ? AND status < 10 AND price >= ${MIN_BTC_PRICE}
           AND give_remaining > 0 AND give_remaining < ${MAX_LISTING_QTY}
           AND oracle_address IS NULL
         ORDER BY price ASC`,
      )
      .bind(asset)
      .all<{ tx_hash: string; price: number; give_remaining: number; source: string; block_time: number }>();

    // Remove stale deal_scores for this asset's dispensers
    await db
      .prepare(
        `DELETE FROM deal_scores
         WHERE asset = ? AND quote = 'BTC' AND listing_type = 'dispenser'`,
      )
      .bind(asset)
      .run();

    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    const lastPrice = dispenses.results[0]?.price ?? medianPrice;
    const recentSales = dispenses.results.slice(0, 5).map((d) => ({
      price: d.price, amount: d.dispense_quantity, date: d.block_time, side: "dispense",
    }));

    const firstDispTs = stats.first_dispense_time ?? now;
    const daysSinceFirst = Math.max((now - firstDispTs) / 86400, 1);
    const avgDays = stats.total_dispense_count > 1
      ? daysSinceFirst / stats.total_dispense_count
      : daysSinceFirst;
    const lastDaysAgo = stats.last_dispense_time
      ? (now - stats.last_dispense_time) / 86400
      : daysSinceFirst;
    const requiredEdgePct = Math.min(10 + avgDays * 1, 50);

    // Tags
    const tags = await db
      .prepare(
        `SELECT t.slug, t.name FROM tag_assets ta
         JOIN tags t ON t.id = ta.tag_id
         WHERE ta.asset = ? AND t.tag_type = 'collection'`,
      )
      .bind(asset)
      .all<{ slug: string; name: string }>();
    const collections = JSON.stringify(tags.results);

    const upserts: D1PreparedStatement[] = [];

    for (const disp of activeDisps.results) {
      if (disp.price >= medianPrice) continue;
      const discountPct = Math.round(((medianPrice - disp.price) / medianPrice) * 100);
      if (discountPct <= 0) continue;

      const score = computeScore(avgDays, lastDaysAgo, discountPct, stats.unique_buyers * 0.5);

      upserts.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO deal_scores (
               listing_id, listing_type, asset, quote, asset_longname,
               listing_price, listing_qty, listing_source, listing_block_time,
               fair_value, fair_value_method, discount_pct,
               last_price, highest_price, lowest_price, average_price, median_price,
               recent_sales_json,
               total_trades, avg_days_between_trades, last_trade_days_ago,
               unique_traders, active_buy_orders,
               dispenser_cheapest_btc, dispenser_active, dispenser_unique_buyers,
               score, required_edge_pct, collections_json, updated_at
             ) VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?,?, ?, ?,?,?, ?,?, ?,?,?, ?,?,?,?)`,
          )
          .bind(
            disp.tx_hash, "dispenser", asset, "BTC", stats.asset_longname,
            disp.price, disp.give_remaining, disp.source, disp.block_time,
            medianPrice, `median_disp_${prices.length}`, discountPct,
            lastPrice, null, null,
            Math.round(avgPrice * 1e8) / 1e8, medianPrice,
            JSON.stringify(recentSales),
            stats.total_dispense_count, Math.round(avgDays * 10) / 10,
            Math.round(lastDaysAgo * 10) / 10,
            stats.unique_buyers, 0,
            disp.price, stats.active_dispensers, stats.unique_buyers,
            score, Math.round(requiredEdgePct), collections, now,
          ),
      );
      scored++;
    }

    if (upserts.length > 0) {
      await db.batch(upserts);
    }
  }

  return scored;
}

/**
 * Remove deal_scores for orders that were closed/cancelled/expired.
 */
export async function pruneClosedDeals(
  db: D1Database,
): Promise<void> {
  // Remove order deals where the order is no longer open
  await db
    .prepare(
      `DELETE FROM deal_scores
       WHERE listing_type = 'order'
         AND NOT EXISTS (
           SELECT 1 FROM orders o
           WHERE o.tx_hash = deal_scores.listing_id
             AND o.status = 'open' AND o.give_remaining > 0
         )`,
    )
    .run();

  // Remove dispenser deals where the dispenser is no longer active
  await db
    .prepare(
      `DELETE FROM deal_scores
       WHERE listing_type = 'dispenser'
         AND NOT EXISTS (
           SELECT 1 FROM dispensers d
           WHERE d.tx_hash = deal_scores.listing_id
             AND d.status < 10 AND d.give_remaining > 0
         )`,
    )
    .run();
}

export async function refreshDealScores(db: D1Database): Promise<{ processed: number }> {
  const now = Math.floor(Date.now() / 1000);

  // Clear old data (full replace each refresh)
  await db.prepare(`DELETE FROM deal_scores`).run();

  // Get all tags once (small table)
  const allTags = await db
    .prepare(
      `SELECT ta.asset, t.slug, t.name
       FROM tag_assets ta
       JOIN tags t ON t.id = ta.tag_id
       WHERE t.tag_type = 'collection'`,
    )
    .all<TagRow>();

  const tagsByAsset = new Map<string, { slug: string; name: string }[]>();
  for (const t of allTags.results) {
    const arr = tagsByAsset.get(t.asset) ?? [];
    arr.push({ slug: t.slug, name: t.name });
    tagsByAsset.set(t.asset, arr);
  }

  let totalProcessed = 0;

  // ===== Pass A: Open sell orders (XCP/PEPECASH/BITCORN quoted) =====
  totalProcessed += await processOrderDeals(db, now, tagsByAsset);

  // ===== Pass B: Active dispensers (BTC quoted) =====
  totalProcessed += await processDispenserDeals(db, now, tagsByAsset);

  return { processed: totalProcessed };
}

async function processOrderDeals(
  db: D1Database,
  now: number,
  tagsByAsset: Map<string, { slug: string; name: string }[]>,
): Promise<number> {
  // Get all open sell orders for non-excluded assets in supported quotes
  const allOrders = await db
    .prepare(
      `SELECT o.tx_hash, o.base_asset, o.quote_asset, o.source, o.price, o.give_remaining, o.pair, o.block_time
       FROM orders o
       JOIN pair_stats ps ON ps.pair = o.pair
       WHERE o.status = 'open'
         AND o.side = 'ask'
         AND o.give_remaining > 0
         AND o.give_remaining < ${MAX_LISTING_QTY}
         AND o.base_asset NOT IN (${EXCLUDED_ASSETS_SQL})
         AND o.quote_asset IN ('XCP', 'PEPECASH', 'BITCORN', 'BTC')
         AND ps.hidden = 0
         AND ps.total_trade_count >= ${MIN_TRADES_FOR_DEAL}
         AND o.base_asset IN (SELECT ta.asset FROM tag_assets ta JOIN tags t ON t.id = ta.tag_id WHERE t.tag_type = 'collection')
       ORDER BY o.price ASC
       LIMIT 1000`,
    )
    .all<OrderListingRow>();

  const orders = allOrders.results;
  if (orders.length === 0) return 0;

  // Get pair stats for all relevant pairs
  const uniquePairs = [...new Set(orders.map((o) => o.pair))];
  const pairStatsMap = new Map<string, PairStatsRow>();

  for (let i = 0; i < uniquePairs.length; i += BATCH_SIZE) {
    const batch = uniquePairs.slice(i, i + BATCH_SIZE);
    const ph = batch.map((_, j) => `?${j + 1}`).join(",");
    const result = await db
      .prepare(
        `SELECT pair, base_asset, quote_asset, base_asset_longname,
                last_price, last_trade_time, total_trade_count,
                all_time_high, all_time_low, first_trade_time,
                unique_traders, bid_count
         FROM pair_stats
         WHERE pair IN (${ph})`,
      )
      .bind(...batch)
      .all<PairStatsRow>();
    for (const ps of result.results) {
      pairStatsMap.set(ps.pair, ps);
    }
  }

  // Get recent trades for all relevant pairs (last 10 per pair)
  const tradesByPair = new Map<string, TradeRow[]>();
  for (let i = 0; i < uniquePairs.length; i += BATCH_SIZE) {
    const batch = uniquePairs.slice(i, i + BATCH_SIZE);
    const ph = batch.map((_, j) => `?${j + 1}`).join(",");
    const result = await db
      .prepare(
        `SELECT base_asset, quote_asset, price, amount, block_time, side
         FROM (
           SELECT base_asset, quote_asset, price, amount, block_time, side,
                  ROW_NUMBER() OVER (PARTITION BY pair ORDER BY block_time DESC) as rn
           FROM trades
           WHERE pair IN (${ph})
         )
         WHERE rn <= 10`,
      )
      .bind(...batch)
      .all<TradeRow>();
    for (const t of result.results) {
      const key = `${t.base_asset}_${t.quote_asset}`;
      const arr = tradesByPair.get(key) ?? [];
      arr.push(t);
      tradesByPair.set(key, arr);
    }
  }

  // Get dispenser stats for context
  const uniqueAssets = [...new Set(orders.map((o) => o.base_asset))];
  const dispByAsset = new Map<string, { cheapest_price: number | null; active_dispensers: number; unique_buyers: number }>();
  for (let i = 0; i < uniqueAssets.length; i += BATCH_SIZE) {
    const batch = uniqueAssets.slice(i, i + BATCH_SIZE);
    const ph = batch.map((_, j) => `?${j + 1}`).join(",");
    const result = await db
      .prepare(
        `SELECT ds.asset, ds.active_dispensers, ds.unique_buyers, ds.cheapest_price
         FROM dispenser_stats ds
         WHERE ds.asset IN (${ph})`,
      )
      .bind(...batch)
      .all<{ asset: string; active_dispensers: number; unique_buyers: number; cheapest_price: number | null }>();
    for (const d of result.results) {
      dispByAsset.set(d.asset, d);
    }
  }

  // Score each order listing
  let processed = 0;
  const upserts: D1PreparedStatement[] = [];

  for (const order of orders) {
    const ps = pairStatsMap.get(order.pair);
    if (!ps) continue;

    const pairKey = `${order.base_asset}_${order.quote_asset}`;
    const trades = tradesByPair.get(pairKey) ?? [];
    if (trades.length === 0) continue;

    const prices = trades.map((t) => t.price);
    const medianPrice = median(prices);
    if (medianPrice === null || medianPrice <= 0) continue;

    // Only care about listings below fair value
    if (order.price >= medianPrice) continue;

    const discountPct = Math.round(((medianPrice - order.price) / medianPrice) * 100);
    if (discountPct <= 0) continue;

    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    const lastPrice = ps.last_price ?? trades[0].price;

    const recentSales = trades.slice(0, 5).map((t) => ({
      price: t.price,
      amount: t.amount,
      date: t.block_time,
      side: t.side,
    }));

    const firstTradeTs = ps.first_trade_time ?? now;
    const daysSinceFirst = Math.max((now - firstTradeTs) / 86400, 1);
    const avgDaysBetweenTrades =
      ps.total_trade_count > 1 ? daysSinceFirst / ps.total_trade_count : daysSinceFirst;
    const lastTradeDaysAgo = ps.last_trade_time
      ? (now - ps.last_trade_time) / 86400
      : daysSinceFirst;

    const requiredEdgePct = Math.min(15 + avgDaysBetweenTrades * 1, 50);

    const dStats = dispByAsset.get(order.base_asset);

    const score = computeScore(
      avgDaysBetweenTrades, lastTradeDaysAgo, discountPct,
      ps.bid_count * 5 + (dStats?.unique_buyers ?? 0) * 0.5,
    );

    const collections = tagsByAsset.get(order.base_asset) ?? [];

    upserts.push(
      db
        .prepare(
          `INSERT INTO deal_scores (
             listing_id, listing_type, asset, quote, asset_longname,
             listing_price, listing_qty, listing_source, listing_block_time,
             fair_value, fair_value_method, discount_pct,
             last_price, highest_price, lowest_price, average_price, median_price,
             recent_sales_json,
             total_trades, avg_days_between_trades, last_trade_days_ago,
             unique_traders, active_buy_orders,
             dispenser_cheapest_btc, dispenser_active, dispenser_unique_buyers,
             score, required_edge_pct, collections_json, updated_at
           ) VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?,?, ?, ?,?,?, ?,?, ?,?,?, ?,?,?,?)`,
        )
        .bind(
          order.tx_hash, "order", order.base_asset, order.quote_asset, ps.base_asset_longname,
          order.price, order.give_remaining, order.source, order.block_time,
          medianPrice, `median_${prices.length}`, discountPct,
          lastPrice, ps.all_time_high, ps.all_time_low,
          Math.round(avgPrice * 1e8) / 1e8, medianPrice,
          JSON.stringify(recentSales),
          ps.total_trade_count, Math.round(avgDaysBetweenTrades * 10) / 10,
          Math.round(lastTradeDaysAgo * 10) / 10,
          ps.unique_traders, ps.bid_count,
          dStats?.cheapest_price ?? null, dStats?.active_dispensers ?? 0, dStats?.unique_buyers ?? 0,
          score, Math.round(requiredEdgePct), JSON.stringify(collections), now,
        ),
    );

    processed++;

    // Flush batch
    if (upserts.length >= BATCH_SIZE) {
      await db.batch(upserts);
      upserts.length = 0;
    }
  }

  if (upserts.length > 0) {
    await db.batch(upserts);
  }

  return processed;
}

async function processDispenserDeals(
  db: D1Database,
  now: number,
  tagsByAsset: Map<string, { slug: string; name: string }[]>,
): Promise<number> {
  // Get all active dispensers with dispense history (non-oracle, with remaining qty)
  const allDispensers = await db
    .prepare(
      `SELECT d.tx_hash, d.asset, d.source, d.price, d.give_remaining, d.block_time
       FROM dispensers d
       JOIN dispenser_stats ds ON ds.asset = d.asset
       WHERE d.status < 10
         AND d.price > 0
         AND d.give_remaining > 0
         AND d.give_remaining < ${MAX_LISTING_QTY}
         AND d.oracle_address IS NULL
         AND d.asset NOT IN (${EXCLUDED_ASSETS_SQL})
         AND ds.hidden = 0
         AND ds.total_dispense_count >= ${MIN_TRADES_FOR_DEAL}
         AND d.asset IN (SELECT ta.asset FROM tag_assets ta JOIN tags t ON t.id = ta.tag_id WHERE t.tag_type = 'collection')
       ORDER BY d.price ASC
       LIMIT 2000`,
    )
    .all<DispenserListingRow>();

  const dispensers = allDispensers.results;
  if (dispensers.length === 0) return 0;

  // Get dispenser stats for all relevant assets
  const uniqueAssets = [...new Set(dispensers.map((d) => d.asset))];
  const statsMap = new Map<string, DispStatsRow>();

  for (let i = 0; i < uniqueAssets.length; i += BATCH_SIZE) {
    const batch = uniqueAssets.slice(i, i + BATCH_SIZE);
    const ph = batch.map((_, j) => `?${j + 1}`).join(",");
    const result = await db
      .prepare(
        `SELECT asset, last_dispense_price, active_dispensers, unique_buyers,
                total_dispense_count, first_dispense_time, last_dispense_time, asset_longname
         FROM dispenser_stats
         WHERE asset IN (${ph})`,
      )
      .bind(...batch)
      .all<DispStatsRow>();
    for (const s of result.results) {
      statsMap.set(s.asset, s);
    }
  }

  // Get recent dispenses for all relevant assets (last 10 per asset)
  const dispensesByAsset = new Map<string, DispenseRow[]>();
  for (let i = 0; i < uniqueAssets.length; i += BATCH_SIZE) {
    const batch = uniqueAssets.slice(i, i + BATCH_SIZE);
    const ph = batch.map((_, j) => `?${j + 1}`).join(",");
    const result = await db
      .prepare(
        `SELECT asset, price, dispense_quantity, block_time
         FROM (
           SELECT asset, price, dispense_quantity, block_time,
                  ROW_NUMBER() OVER (PARTITION BY asset ORDER BY block_time DESC) as rn
           FROM dispenses
           WHERE asset IN (${ph})
         )
         WHERE rn <= 10`,
      )
      .bind(...batch)
      .all<DispenseRow>();
    for (const d of result.results) {
      const arr = dispensesByAsset.get(d.asset) ?? [];
      arr.push(d);
      dispensesByAsset.set(d.asset, arr);
    }
  }

  // Score each dispenser listing
  let processed = 0;
  const upserts: D1PreparedStatement[] = [];

  for (const disp of dispensers) {
    const stats = statsMap.get(disp.asset);
    if (!stats) continue;

    const dispenses = dispensesByAsset.get(disp.asset) ?? [];
    if (dispenses.length === 0) continue;

    const prices = dispenses.map((d) => d.price);
    const medianPrice = median(prices);
    if (medianPrice === null || medianPrice <= 0) continue;

    // Only care about dispensers priced below fair value
    if (disp.price >= medianPrice) continue;

    const discountPct = Math.round(((medianPrice - disp.price) / medianPrice) * 100);
    if (discountPct <= 0) continue;

    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    const lastPrice = dispenses[0].price;

    const recentSales = dispenses.slice(0, 5).map((d) => ({
      price: d.price,
      amount: d.dispense_quantity,
      date: d.block_time,
      side: "dispense",
    }));

    const firstDispenseTs = stats.first_dispense_time ?? now;
    const daysSinceFirst = Math.max((now - firstDispenseTs) / 86400, 1);
    const avgDaysBetweenTrades =
      stats.total_dispense_count > 1
        ? daysSinceFirst / stats.total_dispense_count
        : daysSinceFirst;
    const lastTradeDaysAgo = stats.last_dispense_time
      ? (now - stats.last_dispense_time) / 86400
      : daysSinceFirst;

    const requiredEdgePct = Math.min(15 + avgDaysBetweenTrades * 1, 50);

    const score = computeScore(avgDaysBetweenTrades, lastTradeDaysAgo, discountPct, stats.unique_buyers * 0.5);

    const collections = tagsByAsset.get(disp.asset) ?? [];

    upserts.push(
      db
        .prepare(
          `INSERT INTO deal_scores (
             listing_id, listing_type, asset, quote, asset_longname,
             listing_price, listing_qty, listing_source, listing_block_time,
             fair_value, fair_value_method, discount_pct,
             last_price, highest_price, lowest_price, average_price, median_price,
             recent_sales_json,
             total_trades, avg_days_between_trades, last_trade_days_ago,
             unique_traders, active_buy_orders,
             dispenser_cheapest_btc, dispenser_active, dispenser_unique_buyers,
             score, required_edge_pct, collections_json, updated_at
           ) VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?,?, ?, ?,?,?, ?,?, ?,?,?, ?,?,?,?)`,
        )
        .bind(
          disp.tx_hash, "dispenser", disp.asset, "BTC", stats.asset_longname,
          disp.price, disp.give_remaining, disp.source, disp.block_time,
          medianPrice, `median_disp_${prices.length}`, discountPct,
          lastPrice, null, null,
          Math.round(avgPrice * 1e8) / 1e8, medianPrice,
          JSON.stringify(recentSales),
          stats.total_dispense_count, Math.round(avgDaysBetweenTrades * 10) / 10,
          Math.round(lastTradeDaysAgo * 10) / 10,
          stats.unique_buyers, 0,
          disp.price, stats.active_dispensers, stats.unique_buyers,
          score, Math.round(requiredEdgePct), JSON.stringify(collections), now,
        ),
    );

    processed++;

    if (upserts.length >= BATCH_SIZE) {
      await db.batch(upserts);
      upserts.length = 0;
    }
  }

  if (upserts.length > 0) {
    await db.batch(upserts);
  }

  return processed;
}
