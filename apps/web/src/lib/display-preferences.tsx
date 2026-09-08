'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import useSWR from 'swr'
import { usePreference } from '@/lib/preferences'
import { displayAmount, displayFiat, isCurrency, isNumberPreference, localizeDisplay, parseFxTable, type Currency, type NumberLocale, type NumberPreference } from '@/lib/display-format'

export async function fetchDisplayFx() {
  try {
    const response = await fetch('/api/fx', { signal: AbortSignal.timeout(8000) })
    return response.ok ? parseFxTable(await response.json()) : null
  } catch { return null }
}

function formatters(locale: NumberLocale, currency: Currency, rate: number) {
  return {
    formatAmount: (value: Parameters<typeof displayAmount>[0], usd = false, pct = false) => displayAmount(value, locale, usd, pct),
    displayText: (value: string) => localizeDisplay(value, locale),
    fiat: (usd: number) => displayFiat(usd, currency, rate, locale),
  }
}

const DisplayContext = createContext({
  numberPreference: 'auto' as NumberPreference, numberLocale: 'en-US' as NumberLocale,
  currency: 'USD' as Currency, displayedCurrency: 'USD' as Currency, fxDate: null as string | null,
  setNumberPreference: (() => {}) as (value: NumberPreference) => void, setCurrency: (() => {}) as (value: Currency) => void,
  ...formatters('en-US', 'USD', 1),
})

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [numberPreference, setNumberPreference] = usePreference<NumberPreference>('numberLocale', 'auto', isNumberPreference)
  const [currency, setCurrency] = usePreference<Currency>('fiatCurrency', 'USD', isCurrency)
  // One provider owns the FX request/poll for every formatter on the page.
  // Returning null on failure clears old rates and retries without a render loop.
  const { data } = useSWR(currency === 'USD' ? null : '/api/fx', fetchDisplayFx, {
    refreshInterval: value => value ? 3_600_000 : 60_000,
    dedupingInterval: 30_000, revalidateOnFocus: true, refreshWhenHidden: true, refreshWhenOffline: true,
  })
  const numberLocale = numberPreference === 'auto' ? 'en-US' : numberPreference
  const rate = currency === 'USD' ? 1 : data?.rates[currency]
  const displayedCurrency = rate == null ? 'USD' : currency
  const value = useMemo(() => ({
    numberPreference, numberLocale, currency, displayedCurrency,
    fxDate: displayedCurrency === 'USD' ? null : data?.date ?? null,
    setNumberPreference, setCurrency,
    ...formatters(numberLocale, displayedCurrency, rate ?? 1),
  }), [numberPreference, numberLocale, currency, displayedCurrency, data?.date, setNumberPreference, setCurrency, rate])
  return <DisplayContext value={value}>{children}</DisplayContext>
}

export function useDisplayPreferences() { return useContext(DisplayContext) }
