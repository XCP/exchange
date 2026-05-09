import { determineBaseQuote, makePairString } from "./pairs";

export function sortPoolAssets(assetA: string, assetB: string): [string, string] {
  return assetA <= assetB ? [assetA, assetB] : [assetB, assetA];
}

export function makePoolPair(assetA: string, assetB: string): string {
  const [a, b] = sortPoolAssets(assetA, assetB);
  return makePairString(a, b);
}

export function orientPoolDisplay(assetA: string, assetB: string): {
  display_base_asset: string;
  display_quote_asset: string;
  display_pair: string;
} {
  const { base, quote } = determineBaseQuote(assetA, assetB);
  return {
    display_base_asset: base,
    display_quote_asset: quote,
    display_pair: `${base}/${quote}`,
  };
}
