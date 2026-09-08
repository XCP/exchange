import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Counterwallet gateway Worker runtime", () => {
  it("proxies through the configured service binding", async () => {
    const response = await exports.default.fetch(
      "https://api.counterwallet.io/api/v1/coingecko/tickers"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-counterwallet-gateway")).toBe("1");
    expect(await response.json()).toEqual({ ok: true });
  });
});
