import assert from "node:assert/strict";
import { test } from "node:test";
import { BodyTooLargeError, readJsonObject } from "../src/lib/request-body";
import {
  handleCancelSwap, handlePrepareListingPsbt, handleCompleteListingPsbt,
  handlePrepareFill, handleCompleteFill, SWAP_DETAILS_MAX_BYTES, SWAP_PSBT_MAX_BYTES,
} from "../src/routes/swaps";
import type { Env } from "../src/index";

const encode = (text: string) => new TextEncoder().encode(text);

function input(chunks: Uint8Array[], headers?: HeadersInit, cancel?: () => Promise<void> | void) {
  let read = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (read === chunks.length) controller.close();
      else controller.enqueue(chunks[read++]);
    },
    cancel() { cancelled = true; return cancel?.(); },
  }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: "half" } = { method: "POST", body: stream, headers, duplex: "half" };
  return { request: new Request("https://api.test/swaps", init), stream, state: () => ({ read, cancelled }) };
}

async function failure(work: Promise<unknown>): Promise<unknown> {
  return work.then(() => null, (error: unknown) => error);
}

test("JSON budget counts bytes across split Unicode and accepts the exact limit", async () => {
  const text = '{"value":"🪙漢字"}';
  const bytes = encode(text);
  const source = input(Array.from(bytes, (byte) => Uint8Array.of(byte)));
  assert.deepEqual(await readJsonObject(source.request, bytes.length), { value: "🪙漢字" });
  assert.equal(source.stream.locked, false);
  assert.equal(source.state().cancelled, false);
});

test("actual bytes enforce limits with absent, understated or malformed Content-Length", async () => {
  for (const declared of [undefined, "1", "invalid"]) {
    const source = input([encode("1234"), encode("5"), encode("unread")], declared ? { "content-length": declared } : {});
    assert.ok((await failure(readJsonObject(source.request, 4))) instanceof BodyTooLargeError);
    assert.deepEqual(source.state(), { read: 2, cancelled: true });
    assert.equal(source.stream.locked, false);
  }
});

test("oversized declared JSON is rejected before reading", async () => {
  const source = input([encode("unread")], { "content-length": "99999999999999999999999999" });
  assert.ok((await failure(readJsonObject(source.request, 4))) instanceof BodyTooLargeError);
  assert.deepEqual(source.state(), { read: 0, cancelled: true });
});

test("oversized chunks reject even when cancellation never settles or rejects", async () => {
  for (const cancel of [() => new Promise<void>(() => {}), () => Promise.reject(new Error("cancel failed"))]) {
    const source = input([new Uint8Array(1_000_000)], {}, cancel);
    const result = await Promise.race([
      failure(readJsonObject(source.request, 4)),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 100)),
    ]);
    assert.ok(result instanceof BodyTooLargeError);
    assert.equal(source.stream.locked, false);
  }
});

test("many one-byte chunks, broken streams and malformed JSON have bounded cleanup", async () => {
  const bytes = encode('{"value":"' + "A".repeat(20_000) + '"}');
  const source = input(Array.from(bytes, (byte) => Uint8Array.of(byte)));
  assert.equal(String((await readJsonObject(source.request, bytes.length)).value).length, 20_000);
  for (const text of ["{", "null", "[]", "1", '"text"']) {
    assert.ok((await failure(readJsonObject(input([encode(text)]).request, 100))) instanceof SyntaxError);
  }
  const expected = new Error("source failed");
  const stream = new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(expected) });
  const init: RequestInit & { duplex: "half" } = { method: "POST", body: stream, duplex: "half" };
  assert.equal(await failure(readJsonObject(new Request("https://api.test", init), 100)), expected);
  assert.equal(stream.locked, false);
});

const db = {
  prepare() { throw new Error("invalid input must not reach the database"); },
} as unknown as D1Database;
const env = { DB: db } as Env;
const routes: Array<[string, number, (request: Request) => Promise<Response>]> = [
  ["cancel", SWAP_DETAILS_MAX_BYTES, (request) => handleCancelSwap(request, db, "listing")],
  ["prepare listing", SWAP_DETAILS_MAX_BYTES, (request) => handlePrepareListingPsbt(request, env)],
  ["complete listing", SWAP_PSBT_MAX_BYTES, (request) => handleCompleteListingPsbt(request, env)],
  ["prepare fill", SWAP_DETAILS_MAX_BYTES, (request) => handlePrepareFill(request, env, "listing")],
  ["complete fill", SWAP_PSBT_MAX_BYTES, (request) => handleCompleteFill(request, db, "listing")],
];

for (const [name, maxBytes, route] of routes) {
  test(`${name}: chunked oversize returns 413 before validation or side effects`, async () => {
    const source = input([new Uint8Array(maxBytes), Uint8Array.of(65), encode("unread")]);
    const response = await route(source.request);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "Request body too large", max_bytes: maxBytes });
    assert.deepEqual(source.state(), { read: 2, cancelled: true });
  });
  test(`${name}: exact-limit JSON reaches validation and malformed JSON remains 400`, async () => {
    const exact = await route(input([encode("{}".padEnd(maxBytes, " "))]).request);
    assert.equal(exact.status, 400);
    assert.notEqual((await exact.json() as { error: string }).error, "Invalid JSON body");
    for (const body of ["{", "null", "[]"]) {
      const response = await route(input([encode(body)]).request);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Invalid JSON body" });
    }
  });
}

test("signed PSBT budget accepts the D1 maximum plus a full standard-transaction signature allowance", async () => {
  // D1's 2 MB stored hex + twice Bitcoin's 400k standard weight in hex leaves
  // room for added signatures without mistaking the raw transaction for a PSBT.
  const signed_psbt_hex = "00".repeat(1_400_000);
  const request = input([encode(JSON.stringify({ signed_psbt_hex, fill_request_id: "id" }))]).request;
  assert.equal((await readJsonObject(request, SWAP_PSBT_MAX_BYTES)).signed_psbt_hex, signed_psbt_hex);
});
