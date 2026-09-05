import assert from "node:assert/strict";
import { test } from "node:test";
import { acknowledgeWebSocketClose } from "../src/utils/websocket-close";

test("close acknowledgements preserve valid peer codes and reasons", () => {
  const calls: unknown[][] = [];
  const ws = { close: (...args: unknown[]) => { calls.push(args); } };
  for (const code of [1000, 1001, 1002, 1011, 3000, 4999]) acknowledgeWebSocketClose(ws, code, "leaving");
  assert.deepEqual(calls, [1000, 1001, 1002, 1011, 3000, 4999].map(code => [code, "leaving"]));
});

test("synthetic and reserved close codes are normalized into a sendable handshake", () => {
  const calls: unknown[][] = [];
  const ws = { close: (...args: unknown[]) => { calls.push(args); } };
  for (const code of [0, 999, 1004, 1005, 1006, 1015, 2000, 5000, NaN]) acknowledgeWebSocketClose(ws, code, "synthetic");
  assert.equal(calls.length, 9);
  for (const call of calls) assert.deepEqual(call, [1000, ""]);
});

test("simultaneously closed sockets do not turn a lifecycle callback into an exception", () => {
  let calls = 0;
  acknowledgeWebSocketClose({ close() { calls++; throw new Error("already closed"); } }, 1000, "done");
  assert.equal(calls, 1);
});
