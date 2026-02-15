// Quote asset priority — higher index = higher priority as quote
const QUOTE_PRIORITY: string[] = [
  "PEPECASH",
  "FLDC",
  "BITCRYSTALS",
  "XCP",
  "BTC",
];

export function determineBaseQuote(asset1: string, asset2: string): {
  base: string;
  quote: string;
} {
  const rank1 = QUOTE_PRIORITY.indexOf(asset1);
  const rank2 = QUOTE_PRIORITY.indexOf(asset2);

  // If both are on the list, higher rank = quote
  if (rank1 >= 0 && rank2 >= 0) {
    return rank1 > rank2
      ? { base: asset2, quote: asset1 }
      : { base: asset1, quote: asset2 };
  }

  // If only one is on the list, it's the quote
  if (rank1 >= 0) return { base: asset2, quote: asset1 };
  if (rank2 >= 0) return { base: asset1, quote: asset2 };

  // Neither on the list — alphabetical (lower = base)
  return asset1 < asset2
    ? { base: asset1, quote: asset2 }
    : { base: asset2, quote: asset1 };
}

export function makePairString(base: string, quote: string): string {
  return `${base}_${quote}`;
}
