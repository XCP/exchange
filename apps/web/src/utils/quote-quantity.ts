import { serializeRawInteger } from '@xcp/wallet-sdk/amounts'

/** Quote quantities use the same exact raw units as compose requests. */
export function quoteQuantity(value: string | number | null): string | null {
  if (value === null) return null
  try { return serializeRawInteger(value, { min: 1n }) } catch { return null }
}
