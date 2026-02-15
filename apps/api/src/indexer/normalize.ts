import { OrderMatch, Order, CounterpartyDispenser } from "../lib/counterparty";
import { determineBaseQuote, makePairString } from "../lib/pairs";

// ─── Trades ─────────────────────────────────────────────────────────

export interface NormalizedTrade {
  match_id: string;
  pair: string;
  base_asset: string;
  quote_asset: string;
  block_index: number;
  block_time: number;
  price: number;
  amount: number;
  volume: number;
  side: "buy" | "sell";
  maker: string;
  taker: string;
  tx0_hash: string;
  tx1_hash: string;
}

export function normalizeOrderMatch(match: OrderMatch): NormalizedTrade {
  const { base, quote } = determineBaseQuote(
    match.forward_asset,
    match.backward_asset
  );
  const pair = makePairString(base, quote);

  const forwardQty = parseFloat(match.forward_quantity_normalized);
  const backwardQty = parseFloat(match.backward_quantity_normalized);

  let price: number;
  let amount: number;
  let side: "buy" | "sell";

  if (match.forward_asset === base) {
    // tx0 gives base, tx1 gives quote → price = quote_qty / base_qty
    amount = forwardQty;
    price = forwardQty > 0 ? backwardQty / forwardQty : 0;
    side = "buy";
  } else {
    // tx0 gives quote, tx1 gives base → price = quote_qty / base_qty
    amount = backwardQty;
    price = backwardQty > 0 ? forwardQty / backwardQty : 0;
    side = "sell";
  }

  price = parseFloat(price.toFixed(8));
  amount = parseFloat(amount.toFixed(8));

  return {
    match_id: match.id,
    pair,
    base_asset: base,
    quote_asset: quote,
    block_index: match.block_index,
    block_time: match.block_time,
    price,
    amount,
    volume: parseFloat((price * amount).toFixed(8)),
    side,
    maker: match.tx0_address,
    taker: match.tx1_address,
    tx0_hash: match.tx0_hash,
    tx1_hash: match.tx1_hash,
  };
}

// ─── Orders ─────────────────────────────────────────────────────────

export interface NormalizedOrder {
  tx_hash: string;
  tx_index: number;
  pair: string;
  base_asset: string;
  quote_asset: string;
  source: string;
  side: "bid" | "ask";
  price: number;
  amount: number;
  give_remaining: number;
  get_remaining: number;
  expiration: number;
  expire_index: number;
  block_index: number;
  block_time: number;
}

export function normalizeOrder(order: Order): NormalizedOrder {
  const { base, quote } = determineBaseQuote(order.give_asset, order.get_asset);
  const pair = makePairString(base, quote);

  const giveRemaining = parseFloat(order.give_remaining_normalized);
  const getRemaining = parseFloat(order.get_remaining_normalized);

  let price: number;
  let amount: number;
  let side: "bid" | "ask";

  if (order.give_asset === quote) {
    // Giving quote to get base → bid
    side = "bid";
    amount = getRemaining;
    price = getRemaining > 0 ? giveRemaining / getRemaining : 0;
  } else {
    // Giving base to get quote → ask
    side = "ask";
    amount = giveRemaining;
    price = giveRemaining > 0 ? getRemaining / giveRemaining : 0;
  }

  price = parseFloat(price.toFixed(8));
  amount = parseFloat(amount.toFixed(8));

  return {
    tx_hash: order.tx_hash,
    tx_index: order.tx_index,
    pair,
    base_asset: base,
    quote_asset: quote,
    source: order.source,
    side,
    price,
    amount,
    give_remaining: giveRemaining,
    get_remaining: getRemaining,
    expiration: order.expiration,
    expire_index: order.expire_index,
    block_index: order.block_index,
    block_time: order.block_time,
  };
}

// ─── Dispensers ─────────────────────────────────────────────────────

export interface NormalizedDispenser {
  tx_hash: string;
  tx_index: number;
  asset: string;
  source: string;
  give_quantity: number;
  escrow_quantity: number;
  give_remaining: number;
  satoshi_price: number;
  price: number;
  dispense_count: number;
  status: number;
  block_index: number;
  block_time: number;
  oracle_address: string | null;
}

/**
 * Returns null for oracle dispensers (floating price, not useful for index).
 * Price is per-unit BTC. Uses the API's price_normalized when available
 * (dispenser endpoint), falls back to satoshirate_normalized / give_quantity_normalized
 * (block events, which don't include price_normalized).
 */
export function normalizeDispenser(d: CounterpartyDispenser): NormalizedDispenser | null {
  if (d.oracle_address != null && d.oracle_address !== "") return null;

  const giveQty = parseFloat(d.give_quantity_normalized);

  // price_normalized is per-unit BTC from the /dispensers endpoint.
  // Block events lack this field — compute from satoshirate_normalized / give_quantity.
  const apiPrice = parseFloat(d.price_normalized);
  const price = apiPrice > 0
    ? apiPrice
    : (giveQty > 0 ? parseFloat(d.satoshirate_normalized) / giveQty : 0);

  return {
    tx_hash: d.tx_hash,
    tx_index: d.tx_index,
    asset: d.asset,
    source: d.source,
    give_quantity: giveQty,
    escrow_quantity: parseFloat(d.escrow_quantity_normalized),
    give_remaining: parseFloat(d.give_remaining_normalized),
    satoshi_price: d.satoshirate,
    price,
    dispense_count: d.dispense_count,
    status: d.status,
    block_index: d.block_index,
    block_time: d.block_time,
    oracle_address: null,
  };
}

// ─── Dispenses ──────────────────────────────────────────────────────

/**
 * Compute per-unit BTC price for a dispense event.
 */
export function normalizeDispensePrice(dispenseQty: number, btcAmount: number): number {
  return dispenseQty > 0 ? parseFloat((btcAmount / dispenseQty).toFixed(8)) : 0;
}
