import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchOrderMatches } from "../src/lib/counterparty";

/**
 * The retry loop behind every Counterparty read used to treat 429 as fatal —
 * `res.status < 500` threw immediately — which is backwards: 429 is the node
 * asking to be retried, and it is what a public Counterparty node returns under
 * exactly the load where we most want the read to succeed. It also abandoned
 * every response body, and a Worker holds only six outbound connections, so a
 * flapping node cost three slots per call and held them across both sleeps.
 *
 * These tests drive the loop through `fetchOrderMatches`, the smallest public
 * caller, by swapping `globalThis.fetch`.
 */

const API = "https://example.invalid/v2";

interface Attempt {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Install a fetch that plays the given responses in order and records cancels. */
function stubFetch(attempts: Attempt[]) {
  const real = globalThis.fetch;
  const cancelled: number[] = [];
  let call = 0;

  globalThis.fetch = (async () => {
    const attempt = attempts[Math.min(call, attempts.length - 1)]!;
    const index = call;
    call += 1;
    const body = JSON.stringify(attempt.body ?? { result: [], next_cursor: null });
    const response = new Response(body, {
      status: attempt.status,
      headers: { "content-type": "application/json", ...(attempt.headers ?? {}) },
    });
    // Record cancellation rather than trusting `bodyUsed`, which does not
    // distinguish "cancelled" from "never touched".
    const originalCancel = response.body?.cancel.bind(response.body);
    if (response.body) {
      Object.defineProperty(response.body, "cancel", {
        value: async (reason?: unknown) => {
          cancelled.push(index);
          return originalCancel?.(reason);
        },
        configurable: true,
      });
    }
    return response;
  }) as typeof globalThis.fetch;

  return {
    cancelled,
    calls: () => call,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

test("a 429 is retried rather than treated as fatal", async () => {
  const stub = stubFetch([
    { status: 429, headers: { "retry-after": "0" } },
    { status: 200, body: { result: [], next_cursor: null } },
  ]);
  try {
    const out = await fetchOrderMatches(API);
    assert.deepEqual(out, { matches: [], nextCursor: null });
    assert.equal(stub.calls(), 2, "should have made a second attempt");
  } finally {
    stub.restore();
  }
});

test("the refused response's body is released before the retry", async () => {
  const stub = stubFetch([
    { status: 429, headers: { "retry-after": "0" } },
    { status: 200 },
  ]);
  try {
    await fetchOrderMatches(API);
    assert.deepEqual(stub.cancelled, [0], "the 429's body should be cancelled, the 200's read");
  } finally {
    stub.restore();
  }
});

test("a 5xx is still retried, and its body released", async () => {
  const stub = stubFetch([{ status: 503 }, { status: 200 }]);
  try {
    await fetchOrderMatches(API);
    assert.equal(stub.calls(), 2);
    assert.deepEqual(stub.cancelled, [0]);
  } finally {
    stub.restore();
  }
});

test("a 404 is final, and its body is released rather than leaked", async () => {
  const stub = stubFetch([{ status: 404 }]);
  try {
    let caught: unknown;
    try {
      await fetchOrderMatches(API);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error);
    assert.ok((caught as Error).message.includes("404"));
    assert.equal(stub.calls(), 1, "a 404 must not be retried");
    assert.deepEqual(stub.cancelled, [0]);
  } finally {
    stub.restore();
  }
});

test("retries are bounded, and every abandoned body is released", async () => {
  const stub = stubFetch([
    { status: 429, headers: { "retry-after": "0" } },
    { status: 429, headers: { "retry-after": "0" } },
    { status: 429, headers: { "retry-after": "0" } },
    { status: 429, headers: { "retry-after": "0" } },
  ]);
  try {
    let caught: unknown;
    try {
      await fetchOrderMatches(API);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error);
    // The default is two retries after the first attempt.
    assert.equal(stub.calls(), 3);
    assert.deepEqual(stub.cancelled, [0, 1, 2], "no attempt may keep its body");
  } finally {
    stub.restore();
  }
});

test("an unparseable Retry-After falls back to the loop's own backoff", async () => {
  const stub = stubFetch([
    { status: 429, headers: { "retry-after": "not-a-number" } },
    { status: 200 },
  ]);
  const started = Date.now();
  try {
    await fetchOrderMatches(API);
    assert.equal(stub.calls(), 2);
    // First fallback delay is backoffMs * 1 = 1000ms; allow scheduler slack.
    assert.ok(Date.now() - started >= 900, "should have waited the fallback backoff");
  } finally {
    stub.restore();
  }
});
