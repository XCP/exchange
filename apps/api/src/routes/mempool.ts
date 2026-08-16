import { cacheControl } from "../utils/cache";

/**
 * The unconfirmed side of the DEX, normalised and served from our own edge.
 *
 * Two reasons this exists rather than the browser calling Counterparty
 * directly, which is what useMempoolDispenses did:
 *
 * 1. A client hook that polls a third-party API runs once per OPEN TAB. At a
 *    15s interval, a thousand tabs is ~66 req/s aimed at someone else's public
 *    node, and it scales with our traffic while buying us nothing. Behind this
 *    endpoint it becomes roughly one upstream call per colo per TTL.
 * 2. Counterparty emits raw ledger events -- several per transaction, in
 *    ledger vocabulary (DEBIT, CREDIT, TRANSACTION_PARSED). The UI wants
 *    "what is in flight", one row per transaction. Doing that fold here means
 *    it is done once per TTL instead of once per tab per poll.
 *
 * The TTL is deliberately short. This is the one dataset on the site that
 * decays into a WRONG answer rather than a stale one: a dispenser someone
 * else is already draining, an order that is about to fill. Ten seconds is
 * well inside a block and still collapses the fan-out by orders of magnitude.
 *
 * Never fails loudly. A mempool read that errors must leave every caller's
 * page working -- it is an enrichment, not a dependency -- so an upstream
 * failure returns an empty set with a flag rather than a 5xx that would then
 * be retried by every tab at once.
 */

/** Ledger events worth surfacing, mapped to what a trader would call them. */
const KIND_BY_EVENT: Record<string, string> = {
  OPEN_ORDER: "order",
  ORDER_MATCH: "match",
  DISPENSE: "dispense",
  OPEN_DISPENSER: "dispenser",
  ENHANCED_SEND: "send",
  SEND: "send",
  ASSET_ISSUANCE: "issuance",
  ASSET_DESTRUCTION: "destruction",
  SWEEP: "sweep",
  DISPENSER_UPDATE: "dispenser",
};

interface MempoolEvent {
  tx_hash?: string;
  event?: string;
  timestamp?: number;
  params?: Record<string, unknown>;
}

export interface MempoolEntry {
  tx_hash: string;
  kind: string;
  event: string;
  timestamp: number | null;
  source: string | null;
  /** Present for the shapes where an asset is the point of the transaction. */
  asset: string | null;
  give_asset: string | null;
  get_asset: string | null;
  give_quantity: number | null;
  get_quantity: number | null;
  /** DISPENSE only: which dispenser is being drained. */
  dispenser_tx_hash: string | null;
  btc_amount: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function handleMempool(request: Request, env: { CP_API_BASE: string }): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const kindFilter = url.searchParams.get("kind");

  let raw: MempoolEvent[] = [];
  let upstreamOk = true;
  try {
    // AbortSignal so a hung upstream cannot hold this worker open; the whole
    // point of the endpoint is that it answers fast or not at all.
    const res = await fetch(`${env.CP_API_BASE}/mempool/events?limit=500`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const body = (await res.json()) as { result?: MempoolEvent[] };
    raw = body.result ?? [];
  } catch {
    upstreamOk = false;
  }

  /**
   * One row per transaction, not per ledger event.
   *
   * A single order produces OPEN_ORDER plus DEBIT plus TRANSACTION_PARSED plus
   * NEW_TRANSACTION. Keeping the FIRST recognised event per tx_hash picks the
   * meaningful one, because the bookkeeping events are not in KIND_BY_EVENT at
   * all -- they are skipped rather than ranked.
   */
  const byTx = new Map<string, MempoolEntry>();
  for (const e of raw) {
    const event = e.event ?? "";
    const kind = KIND_BY_EVENT[event];
    if (!kind) continue;
    const hash = str(e.tx_hash) ?? str(e.params?.tx_hash);
    if (!hash || byTx.has(hash)) continue;
    const p = e.params ?? {};
    byTx.set(hash, {
      tx_hash: hash,
      kind,
      event,
      timestamp: num(e.timestamp),
      source: str(p.source),
      asset: str(p.asset),
      give_asset: str(p.give_asset),
      get_asset: str(p.get_asset),
      give_quantity: num(p.give_quantity),
      get_quantity: num(p.get_quantity),
      dispenser_tx_hash: str(p.dispenser_tx_hash),
      btc_amount: num(p.btc_amount),
    });
  }

  let entries = [...byTx.values()];
  if (kindFilter) {
    const wanted = new Set(kindFilter.split(",").map((k) => k.trim()).filter(Boolean));
    entries = entries.filter((e) => wanted.has(e.kind));
  }
  // Newest first — a feed reads top-down. Entries with no timestamp sort last
  // rather than jumping to the top on a falsy comparison.
  entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  entries = entries.slice(0, limit);

  return Response.json(
    { entries, count: entries.length, upstream_ok: upstreamOk },
    { headers: { "Cache-Control": cacheControl(url, 10) } }
  );
}
