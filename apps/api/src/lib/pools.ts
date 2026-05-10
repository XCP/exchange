import { determineBaseQuote } from "./pairs";

// Counterparty stores pools by lexicographic asset order. This is protocol
// identity, not the xcpdex base/quote display orientation.
export function sortPoolAssets(assetA: string, assetB: string): [string, string] {
  return assetA <= assetB ? [assetA, assetB] : [assetB, assetA];
}

export function makePoolPair(assetA: string, assetB: string): string {
  const [a, b] = sortPoolAssets(assetA, assetB);
  return `${a}_${b}`;
}

export function orientPoolDisplay(assetA: string, assetB: string): {
  display_base_asset: string;
  display_quote_asset: string;
  display_pair: string;
  display_pair_slug: string;
} {
  // xcpdex display orientation follows market base/quote rules, which can
  // differ from Counterparty's lexicographic pool identity.
  const { base, quote } = determineBaseQuote(assetA, assetB);
  return {
    display_base_asset: base,
    display_quote_asset: quote,
    display_pair: `${base}/${quote}`,
    display_pair_slug: `${base}_${quote}`,
  };
}
