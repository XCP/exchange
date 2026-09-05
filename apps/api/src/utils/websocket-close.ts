/** Finish the peer's close handshake on our existing compatibility date.
 * Synthetic/invalid close codes cannot be echoed on the wire. */
export function acknowledgeWebSocketClose(
  ws: Pick<WebSocket, "close">,
  code = 1000,
  reason = "",
): void {
  const validCode = Number.isInteger(code) && (
    (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) ||
    (code >= 3000 && code <= 4999)
  );
  try {
    ws.close(validCode ? code : 1000, validCode ? reason : "");
  } catch {
    // A transport error or simultaneous close can have already reaped it.
  }
}
