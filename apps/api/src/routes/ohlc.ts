import { forwardFillCandles } from "../indexer/forward-fill";

const VALID_INTERVALS = new Set(["1h", "4h", "1d", "1w", "1m"]);

export async function handleOhlc(
  request: Request,
  db: D1Database,
  pair: string
): Promise<Response> {
  const url = new URL(request.url);
  const interval = url.searchParams.get("interval");
  if (!interval || !VALID_INTERVALS.has(interval)) {
    return Response.json(
      { error: "interval required: 1h, 4h, 1d, 1w, 1m" },
      { status: 400 }
    );
  }

  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "300", 10) || 300,
    500
  );
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // Forward-fill before querying so chart has no gaps
  const now = Math.floor(Date.now() / 1000);
  await forwardFillCandles(db, pair, interval, now);

  let query = `SELECT timestamp, open, high, low, close, volume
               FROM candles WHERE pair = ? AND interval = ?`;
  const binds: (string | number)[] = [pair, interval];

  if (from) {
    query += ` AND timestamp >= ?`;
    binds.push(parseInt(from, 10));
  }
  if (to) {
    query += ` AND timestamp <= ?`;
    binds.push(parseInt(to, 10));
  }

  query += ` ORDER BY timestamp DESC LIMIT ?`;
  binds.push(limit);

  const result = await db
    .prepare(query)
    .bind(...binds)
    .all<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>();

  // Reverse so oldest first
  const candles = result.results.reverse().map((c) => ({
    t: c.timestamp,
    o: c.open,
    h: c.high,
    l: c.low,
    c: c.close,
    v: c.volume,
  }));

  return Response.json(
    { pair, interval, candles },
    {
      headers: {
        "Cache-Control": "public, max-age=10",
      },
    }
  );
}
