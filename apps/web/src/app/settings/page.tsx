'use client'

import { CURRENCIES, NUMBER_LOCALES, isCurrency, isNumberPreference } from '@/lib/display-format'
import { useDisplayPreferences } from '@/lib/display-preferences'

export default function SettingsPage() {
  const preferences = useDisplayPreferences()
  const selectClass = 'mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100'
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <h1 className="text-xl font-semibold">Display settings</h1>
      <p className="text-sm text-zinc-400">Interface language: English</p>
      <div className="text-sm"><label htmlFor="display-number-format">Number format</label>
        <select id="display-number-format" className={selectClass} value={preferences.numberPreference} onChange={event => { if (isNumberPreference(event.target.value)) preferences.setNumberPreference(event.target.value) }}>
          <option value="auto">Follow interface language (English)</option>
          {NUMBER_LOCALES.map(locale => <option key={locale} value={locale}>{locale} · {new Intl.NumberFormat(locale).format(1234.56)}</option>)}
        </select>
      </div>
      <div className="text-sm"><label htmlFor="display-fiat-currency">Fiat display currency</label>
        <select id="display-fiat-currency" className={selectClass} value={preferences.currency} onChange={event => { if (isCurrency(event.target.value)) preferences.setCurrency(event.target.value) }}>
          {CURRENCIES.map(code => <option key={code}>{code}</option>)}
        </select>
      </div>
      <p className="text-sm text-zinc-400" role="status">
        {preferences.currency !== preferences.displayedCurrency
          ? `${preferences.currency} conversion is unavailable. Values are shown and labeled in USD.`
          : `Fiat values are shown in ${preferences.displayedCurrency}.${preferences.fxDate ? ` Reference rates: ${preferences.fxDate}.` : ''}`}
      </p>
      <p className="text-sm text-zinc-400">Applies to trading summaries, the order book, and header prices. Charts and historical analytics retain their labeled units. Amount and price inputs use a decimal point without grouping, such as 1234.56.</p>
    </main>
  )
}
