import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("xcpdex Worker runtime", () => {
  it("loads in workerd and returns a bounded 404", async () => {
    const response = await exports.default.fetch("https://api.xcpdex.com/not-a-route");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("404 Not Found");
  });

  it("serves the generated API contract through the production Worker entrypoint", async () => {
    const response = await exports.default.fetch("https://api.xcpdex.com/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const contract = await response.json<{ info: { title: string } }>();
    expect(contract.info.title).toBe("XCP DEX Market Data API");
  });
});
