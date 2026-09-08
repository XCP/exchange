import assert from "node:assert/strict";
import { test } from "node:test";
import { fixScientificNotationStream } from "../src/lib/json";

function chunkedJson(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

test("scientific notation is rewritten across stream boundaries", async () => {
  const input = [
    '{"small":7.1',
    'e-',
    '7,"negative":-1.2E',
    '-4,"normal":12.3}',
  ];
  const output = await new Response(fixScientificNotationStream(chunkedJson(input))).text();
  assert.equal(output, '{"small":0.00000071,"negative":-0.00012,"normal":12.3}');
});

test("numeric-looking text and escaped quotes remain unchanged", async () => {
  const input = ['{"text":"asset 7.1', 'e-7 \\"still text\\"","value":2e-3}'];
  const output = await new Response(fixScientificNotationStream(chunkedJson(input))).text();
  assert.equal(output, '{"text":"asset 7.1e-7 \\"still text\\"","value":0.002}');
});

test("expanded values remain valid JSON when the coefficient starts with zero", async () => {
  const input = ['{"shifted":0.1e2,"zero":0e4,"negativeZero":-0e2}'];
  const output = await new Response(fixScientificNotationStream(chunkedJson(input))).text();
  assert.equal(output, '{"shifted":10,"zero":0,"negativeZero":-0}');
  assert.deepEqual(JSON.parse(output), { shifted: 10, zero: 0, negativeZero: -0 });
});
