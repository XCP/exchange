import { cacheControl } from "../utils/cache";

export async function handleAssetActivity(
  request: Request,
  db: D1Database,
  asset: string
): Promise<Response> {
  const url = new URL(request.url);
  const upper = asset.toUpperCase();

  const query = `
    SELECT day,
      SUM(trades) as trades,
      SUM(dispenses) as dispenses,
      SUM(orders_placed) as orders_placed,
      SUM(dispensers_created) as dispensers_created,
      SUM(sends) as sends
    FROM (
      SELECT DATE(block_time, 'unixepoch') as day, COUNT(*) as trades, 0 as dispenses, 0 as orders_placed, 0 as dispensers_created, 0 as sends
      FROM trades WHERE base_asset = ? OR quote_asset = ?
      GROUP BY day
      UNION ALL
      SELECT DATE(block_time, 'unixepoch') as day, 0, COUNT(*), 0, 0, 0
      FROM dispenses WHERE asset = ?
      GROUP BY day
      UNION ALL
      SELECT DATE(block_time, 'unixepoch') as day, 0, 0, COUNT(*), 0, 0
      FROM orders WHERE base_asset = ? OR quote_asset = ?
      GROUP BY day
      UNION ALL
      SELECT DATE(block_time, 'unixepoch') as day, 0, 0, 0, COUNT(*), 0
      FROM dispensers WHERE asset = ?
      GROUP BY day
      UNION ALL
      SELECT DATE(block_time, 'unixepoch') as day, 0, 0, 0, 0, COUNT(*)
      FROM sends WHERE asset = ?
      GROUP BY day
    )
    GROUP BY day
    ORDER BY day
  `;

  const result = await db.prepare(query).bind(upper, upper, upper, upper, upper, upper, upper).all();

  return Response.json(
    { activity: result.results },
    { headers: { "Cache-Control": cacheControl(url, 300) } }
  );
}
