import assert from "node:assert/strict";
import { test } from "node:test";
import { handleCgOrderbook } from "../src/routes/coingecko";

function btcBookDb(sql: string[]): D1Database {
  const statements: D1PreparedStatement[] = [];
  const db = {
    prepare(query: string) {
      sql.push(query);
      const statement = {
        bind() {
          return statement;
        },
      } as unknown as D1PreparedStatement;
      statements.push(statement);
      return statement;
    },
    async batch() {
      return [{ results: [{ price: 0.00006, amount: 25 }] }] as unknown as D1Result[];
    },
  };
  return db as unknown as D1Database;
}

test("BTC aggregator order books query only escrow-backed dispenser asks", async () => {
  const sql: string[] = [];
  const response = await handleCgOrderbook(
    new Request("https://api.xcpdex.com/coingecko/orderbook?ticker_id=XCP_BTC&depth=100"),
    btcBookDb(sql),
    ["XCP_BTC"]
  );
  const body = await response.json() as {
    bids: [string, string][];
    asks: [string, string][];
  };

  assert.equal(response.status, 200);
  assert.equal(sql.length, 1);
  assert.equal(sql[0].includes("FROM dispensers"), true);
  assert.equal(sql[0].includes("FROM orders"), false);
  assert.deepEqual(body.bids, []);
  assert.deepEqual(body.asks, [["0.00006", "25.00000000"]]);
});
