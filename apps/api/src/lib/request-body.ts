export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Body exceeds ${maxBytes} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/** Count actual UTF-8 bytes before decoding/JSON parsing, regardless of headers. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing JSON body");
  let complete = false;
  try {
    const declared = request.headers.get("content-length");
    if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
      throw new BodyTooLargeError(maxBytes);
    }
    let bytes = new Uint8Array(Math.min(maxBytes, 16_384));
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        const result: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
        if (result === null || typeof result !== "object" || Array.isArray(result)) {
          throw new SyntaxError("JSON body must be an object");
        }
        return result as Record<string, unknown>;
      }
      const nextSize = size + value.byteLength;
      if (nextSize > maxBytes) throw new BodyTooLargeError(maxBytes);
      if (nextSize > bytes.byteLength) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(nextSize, bytes.byteLength * 2)));
        grown.set(bytes.subarray(0, size));
        bytes = grown;
      }
      bytes.set(value, size);
      size = nextSize;
    }
  } finally {
    // A stalled source (or a tee's other branch) need not finish cancellation.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function jsonBodyError(error: unknown): Response {
  return error instanceof BodyTooLargeError
    ? Response.json({ error: "Request body too large", max_bytes: error.maxBytes }, { status: 413 })
    : Response.json({ error: "Invalid JSON body" }, { status: 400 });
}
