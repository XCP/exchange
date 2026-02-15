import { OrderMatch } from "../lib/counterparty";
import { determineBaseQuote, makePairString } from "../lib/pairs";

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
    // tx0 gives base, tx1 gives quote
    // price = quote_qty / base_qty
    amount = forwardQty;
    price = backwardQty / forwardQty;
    // tx1 (taker) is buying base with quote
    side = "buy";
  } else {
    // tx0 gives quote, tx1 gives base
    // price = quote_qty / base_qty
    amount = backwardQty;
    price = forwardQty / backwardQty;
    // tx1 (taker) is selling base for quote
    side = "sell";
  }

  return {
    match_id: match.id,
    pair,
    base_asset: base,
    quote_asset: quote,
    block_index: match.block_index,
    block_time: match.block_time,
    price,
    amount,
    volume: price * amount,
    side,
    maker: match.tx0_address,
    taker: match.tx1_address,
    tx0_hash: match.tx0_hash,
    tx1_hash: match.tx1_hash,
  };
}
