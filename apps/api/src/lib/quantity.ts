export function parseQuantity(value: unknown, fallback: number = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function normalizeRawQuantity(
  raw: number,
  assetInfo: Record<string, unknown> | undefined
): number {
  return assetInfo?.divisible === true ? raw / 1e8 : raw;
}

export function eventQuantity(
  params: Record<string, unknown>,
  normalizedKey: string,
  rawKey: string,
  assetInfoKey?: string
): number {
  const normalized = params[normalizedKey];
  if (normalized != null) return parseQuantity(normalized);

  const raw = parseQuantity(params[rawKey]);
  return normalizeRawQuantity(
    raw,
    assetInfoKey ? params[assetInfoKey] as Record<string, unknown> | undefined : undefined
  );
}
