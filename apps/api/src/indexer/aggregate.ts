const INTERVAL_SECONDS: Record<string, number> = {
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
  "1m": 2592000, // 30 days
};

export const ALL_INTERVALS = Object.keys(INTERVAL_SECONDS);

export function bucketTimestamp(
  unixSeconds: number,
  interval: string
): number {
  const size = INTERVAL_SECONDS[interval];
  if (!size) throw new Error(`Unknown interval: ${interval}`);
  return Math.floor(unixSeconds / size) * size;
}

export async function aggregateCandlesForPair(
  db: D1Database,
  pair: string,
  sinceTime: number
): Promise<void> {
  for (const interval of ALL_INTERVALS) {
    const bucketSize = INTERVAL_SECONDS[interval];
    const startBucket = bucketTimestamp(sinceTime, interval);

    // Get all trades for this pair from the affected time range
    const trades = await db
      .prepare(
        `SELECT block_time, price, amount, volume, side
         FROM trades
         WHERE pair = ? AND block_time >= ?
         ORDER BY block_time ASC`
      )
      .bind(pair, startBucket)
      .all<{
        block_time: number;
        price: number;
        amount: number;
        volume: number;
        side: string;
      }>();

    if (!trades.results.length) continue;

    // Group trades by bucket
    const buckets = new Map<
      number,
      {
        prices: { time: number; price: number }[];
        volume: number;
        buyVolume: number;
        sellVolume: number;
        count: number;
      }
    >();

    for (const trade of trades.results) {
      const bucket = bucketTimestamp(trade.block_time, interval);
      let entry = buckets.get(bucket);
      if (!entry) {
        entry = {
          prices: [],
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          count: 0,
        };
        buckets.set(bucket, entry);
      }
      entry.prices.push({ time: trade.block_time, price: trade.price });
      entry.volume += trade.volume;
      if (trade.side === "buy") entry.buyVolume += trade.volume;
      else entry.sellVolume += trade.volume;
      entry.count++;
    }

    // Upsert candles for each bucket
    for (const [timestamp, data] of buckets) {
      data.prices.sort((a, b) => a.time - b.time);
      const open = data.prices[0].price;
      const close = data.prices[data.prices.length - 1].price;
      const high = Math.max(...data.prices.map((p) => p.price));
      const low = Math.min(...data.prices.map((p) => p.price));

      await db
        .prepare(
          `INSERT INTO candles (pair, interval, timestamp, open, high, low, close, volume, buy_volume, sell_volume, trades)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (pair, interval, timestamp)
           DO UPDATE SET open = excluded.open, high = excluded.high, low = excluded.low,
                         close = excluded.close, volume = excluded.volume,
                         buy_volume = excluded.buy_volume, sell_volume = excluded.sell_volume,
                         trades = excluded.trades`
        )
        .bind(
          pair,
          interval,
          timestamp,
          open,
          high,
          low,
          close,
          data.volume,
          data.buyVolume,
          data.sellVolume,
          data.count
        )
        .run();
    }
  }
}
