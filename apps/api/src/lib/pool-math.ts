export const YEAR_SECONDS = 365 * 24 * 60 * 60;

export function calculatePoolPriceInQuote(
  baseReserve: number,
  quoteReserve: number
): number | null {
  if (baseReserve <= 0 || quoteReserve <= 0) return null;
  return quoteReserve / baseReserve;
}

export function calculatePoolValueInQuote(
  baseReserve: number,
  quoteReserve: number
): number | null {
  const price = calculatePoolPriceInQuote(baseReserve, quoteReserve);
  if (price == null) return null;
  return quoteReserve + baseReserve * price;
}

/** Total constant-product reserves valued through the pool's quote leg. */
export function calculatePoolLiquidityUsd(
  baseReserve: number,
  quoteReserve: number,
  quoteUsd: number
): number | null {
  if (!Number.isFinite(quoteUsd) || quoteUsd <= 0) return null;
  const valueInQuote = calculatePoolValueInQuote(baseReserve, quoteReserve);
  return valueInQuote == null ? null : valueInQuote * quoteUsd;
}

export function calculateFeeValueInQuote(
  baseReserve: number,
  quoteReserve: number,
  baseFees: number,
  quoteFees: number
): number | null {
  const price = calculatePoolPriceInQuote(baseReserve, quoteReserve);
  if (price == null) return null;
  return quoteFees + baseFees * price;
}

export function calculatePoolFeePeriodReturnInQuote(
  baseReserve: number,
  quoteReserve: number,
  baseFees: number,
  quoteFees: number
): number | null {
  const feeValueInQuote = calculateFeeValueInQuote(baseReserve, quoteReserve, baseFees, quoteFees);
  const poolValueInQuote = calculatePoolValueInQuote(baseReserve, quoteReserve);
  if (feeValueInQuote == null || poolValueInQuote == null) return null;
  return poolValueInQuote > 0 ? feeValueInQuote / poolValueInQuote : 0;
}

export function calculateFeeApy(
  periodReturn: number | null,
  windowSeconds: number
): number | null {
  if (periodReturn == null || !Number.isFinite(periodReturn) || windowSeconds <= 0) return null;
  return Math.pow(1 + periodReturn, YEAR_SECONDS / windowSeconds) - 1;
}
