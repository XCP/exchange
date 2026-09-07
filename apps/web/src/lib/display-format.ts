import { formatAmount } from '@/utils/format-amount'

export const NUMBER_LOCALES = ['en-US', 'de-DE', 'fr-FR', 'es-VE', 'es-ES', 'ja-JP', 'zh-CN', 'zh-HK', 'ko-KR', 'pt-BR'] as const
export type NumberLocale = typeof NUMBER_LOCALES[number]
export type NumberPreference = NumberLocale | 'auto'
export const CURRENCIES = ['USD', 'EUR', 'JPY', 'CNY', 'HKD', 'GBP', 'KRW', 'BRL'] as const
export type Currency = typeof CURRENCIES[number]
export const isNumberPreference = (value: unknown): value is NumberPreference => value === 'auto' || NUMBER_LOCALES.includes(value as NumberLocale)
export const isCurrency = (value: unknown): value is Currency => CURRENCIES.includes(value as Currency)

/** Formats trusted output from the English display helpers, never an input draft.
 * BigInt groups the integer without passing exact digits through a double. */
export function localizeDisplay(value: string, locale: NumberLocale): string {
  const match = /^(-?)([\d,]+)(?:\.(\d+))?([KMBTQ%]?)$/.exec(value)
  if (!match) return value
  const [, sign, whole, fraction, suffix] = match
  const integer = BigInt(sign + whole.replaceAll(',', ''))
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(integer)
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.'
  // BigInt has no negative zero, but a negative subunit amount still does.
  return `${sign && integer === 0n ? '-' : ''}${grouped}${fraction === undefined ? '' : decimal + fraction}${suffix}`
}

export function displayAmount(value: Parameters<typeof formatAmount>[0], locale: NumberLocale, usd = false, pct = false): string {
  return localizeDisplay(formatAmount(value, usd, pct), locale)
}

export function displayFiat(usd: number, currency: Currency, rate: number, locale: NumberLocale): string {
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || rate <= 0) return '—'
  const value = usd * rate
  const options: Intl.NumberFormatOptions = { style: 'currency', currency, currencyDisplay: 'code' }
  // Preserve a useful indication for small token prices, including yen.
  if (value !== 0 && Math.abs(value) < 1) options.maximumSignificantDigits = 4
  return new Intl.NumberFormat(locale, options).format(value)
}

export interface FxTable { base: 'USD'; date: string; rates: Partial<Record<Currency, number>> }
export function parseFxTable(value: unknown, now = Date.now()): FxTable | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  if (body.base !== 'USD' || typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return null
  const date = Date.parse(body.date + 'T00:00:00Z')
  if (!Number.isFinite(date) || date > now || now - date > 7 * 86_400_000) return null
  if (!body.rates || typeof body.rates !== 'object' || Array.isArray(body.rates)) return null
  const rates: FxTable['rates'] = { USD: 1 }
  for (const [code, rate] of Object.entries(body.rates)) {
    if (isCurrency(code) && code !== 'USD' && typeof rate === 'number' && Number.isFinite(rate) && rate > 0) rates[code] = rate
  }
  return Object.keys(rates).length > 1 ? { base: 'USD', date: body.date, rates } : null
}
