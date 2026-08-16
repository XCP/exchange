// Quote asset priority - higher index = higher priority as quote.
// Must match apps/web/src/utils/constants.ts QUOTE_ASSETS (reversed).
const QUOTE_PRIORITY: string[] = [
  "FUTURECREDIT", "MUUI", "VACUS", "WOOOOK", "FUUUUUH", "FUUUUUH.BTC",
  "RAIZER", "RAIZER.BTC", "BASSMINT", "NOMNI", "NOJAK", "POWC", "NVST",
  "KEKO", "DABC", "SWARM", "BOBOXX", "CRONOS", "SHARPS", "BOBOCASH", "DOLLARCASH",
  "DESANTISCASH", "DANKROSECASH", "FAKEAPECASH", "BLUEBEARCASH",
  "SHADILAYCASH", "RELICASH", "NEOCASH", "IAMCOIN", "LICKOIN",
  "MOULACOIN", "GREEEEEECOIN", "SCUDOCOIN", "PEPSTEIN.HUSHMONEY",
  "COMMONFROG.PURCHASE", "DANKMEMECASH", "BITROCK", "OLINCOIN",
  "SOVEREIGNC", "XFCCOIN", "WILLCOIN", "RUSTBITS", "PENISIUM",
  "MAFIACASH", "DATABITS", "NEWBITCORN", "CORNFUTURES", "BITCORN",
  "PEPECASH", "SCOTCOIN", "LTBCOIN", "BITCRYSTALS", "SJCX", "FLDC",
  "XBTC", "XCP", "BTC",
];

// Keyword-based fallback for assets not in the explicit list.
const QUOTE_KEYWORDS: string[] = ["CASH", "COIN", "MONEY", "BTC"];

function isQuoteByKeyword(symbol: string): boolean {
  return QUOTE_KEYWORDS.some((kw) => symbol.toUpperCase().includes(kw));
}

export function determineBaseQuote(asset1: string, asset2: string): {
  base: string;
  quote: string;
} {
  const rank1 = QUOTE_PRIORITY.indexOf(asset1);
  const rank2 = QUOTE_PRIORITY.indexOf(asset2);

  // If both are on the list, higher rank = quote.
  if (rank1 >= 0 && rank2 >= 0) {
    return rank1 > rank2
      ? { base: asset2, quote: asset1 }
      : { base: asset1, quote: asset2 };
  }

  // If only one is on the list, it's the quote.
  if (rank1 >= 0) return { base: asset2, quote: asset1 };
  if (rank2 >= 0) return { base: asset1, quote: asset2 };

  // Neither on the list - check keyword fallback.
  const kw1 = isQuoteByKeyword(asset1);
  const kw2 = isQuoteByKeyword(asset2);
  if (kw1 && !kw2) return { base: asset2, quote: asset1 };
  if (kw2 && !kw1) return { base: asset1, quote: asset2 };

  // Both or neither match keywords - alphabetical lower sorts as base.
  // localeCompare, matching extension/src/core/tradingPair.ts, which is the
  // standard this list is a mirror of. `<` disagrees with it on names
  // containing an underscore.
  return asset1.localeCompare(asset2) < 0
    ? { base: asset1, quote: asset2 }
    : { base: asset2, quote: asset1 };
}

export function makePairString(base: string, quote: string): string {
  return `${base}_${quote}`;
}
