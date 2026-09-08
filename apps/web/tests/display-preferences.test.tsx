import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { DisplayPreferencesProvider, useDisplayPreferences } from '@/lib/display-preferences'
import { displayFiat, localizeDisplay, parseFxTable } from '@/lib/display-format'
import { writeRaw } from '@/lib/preferences'
import SettingsPage from '@/app/settings/page'
import { GET } from '@/app/api/fx/route'
import { OrderBookLadder } from '@/components/order-book-ladder'

const response = () => Response.json({ base: 'USD', date: new Date().toISOString().slice(0, 10), rates: { EUR: 0.9, JPY: 150, CNY: 7 } })
function Sample() {
  const { fiat, displayText } = useDisplayPreferences()
  return <><output data-testid="fiat">{fiat(12.34)}</output><output data-testid="exact">{displayText('9007199254740993.00000001')}</output></>
}
function mount(children = <Sample />) {
  return render(<SWRConfig value={{ provider: () => new Map() }}><DisplayPreferencesProvider><SettingsPage />{children}</DisplayPreferencesProvider></SWRConfig>)
}
beforeEach(() => {
  writeRaw('numberLocale', null)
  writeRaw('fiatCurrency', null)
  vi.stubGlobal('fetch', vi.fn(async () => response()))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('independent display preferences', () => {
  it('defaults to English and USD regardless of browser language, preserving explicit choices on remount', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP')
    const first = mount()
    expect(screen.getByTestId('fiat').textContent).toContain('USD')
    expect(fetch).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByLabelText('Number format'), 'fr-FR')
    expect(screen.getByTestId('fiat').textContent).toContain('12,34')
    expect(screen.getByTestId('fiat').textContent).toContain('USD')
    expect(screen.getByTestId('exact').textContent).toBe('9\u202f007\u202f199\u202f254\u202f740\u202f993,00000001')
    first.unmount()
    mount()
    window.dispatchEvent(new Event('languagechange'))
    expect((screen.getByLabelText('Number format') as HTMLSelectElement).value).toBe('fr-FR')
    expect((screen.getByLabelText('Fiat display currency') as HTMLSelectElement).value).toBe('USD')
  })

  it('keeps choices in memory when storage reads and writes throw, with one FX request for multiple consumers', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const first = mount(<><Sample /><Sample /></>)
    await userEvent.selectOptions(screen.getByLabelText('Fiat display currency'), 'EUR')
    await waitFor(() => expect(screen.getAllByTestId('fiat')[0].textContent).toContain('EUR'))
    await userEvent.selectOptions(screen.getByLabelText('Number format'), 'de-DE')
    expect(screen.getAllByTestId('fiat')[0].textContent).toContain('11,11')
    expect(fetch).toHaveBeenCalledTimes(1)
    first.unmount()
    mount()
    expect((screen.getByLabelText('Fiat display currency') as HTMLSelectElement).value).toBe('EUR')
    expect((screen.getByLabelText('Number format') as HTMLSelectElement).value).toBe('de-DE')
  })

  it('accepts relevant cross-tab changes and resets defaults on storage clear', async () => {
    mount()
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'xcpdex:numberLocale', newValue: '"es-VE"' })))
    expect((screen.getByLabelText('Number format') as HTMLSelectElement).value).toBe('es-VE')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'xcpdex:fiatCurrency', newValue: '"JPY"' })))
    await waitFor(() => expect(screen.getByTestId('fiat').textContent).toContain('JPY'))
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })))
    expect((screen.getByLabelText('Number format') as HTMLSelectElement).value).toBe('auto')
    expect(screen.getByTestId('fiat').textContent).toContain('USD')
  })

  it('refreshes an open page and falls back to labeled USD on failure, then retries', async () => {
    vi.useFakeTimers()
    writeRaw('fiatCurrency', '"EUR"')
    await act(async () => { mount(); await vi.advanceTimersByTimeAsync(10) })
    expect(screen.getByTestId('fiat').textContent).toContain('EUR')
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000) })
    expect(screen.getByTestId('fiat').textContent).toContain('USD')
    expect(screen.getByText(/EUR conversion is unavailable/)).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(screen.getByTestId('fiat').textContent).toContain('EUR')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('localizes an order-book cell while its click still supplies the exact canonical preset', async () => {
    const pick = vi.fn()
    mount(<OrderBookLadder bids={[{ price: '1,234.56789012', amount: '1,000', total: '0', pricePlain: '1234.56789012', amountPlain: '1000' }]} asks={[]} spread="0" spreadPct="0" isLoading={false} quoteLabel="XCP" onPickPrice={pick} />)
    await userEvent.selectOptions(screen.getByLabelText('Number format'), 'de-DE')
    expect(screen.getByText('1.234,56789012')).toBeTruthy()
    await userEvent.click(screen.getByTitle('Use this price'))
    expect(pick).toHaveBeenCalledWith('1234.56789012')
  })
})

describe('fiat and exact presentation boundaries', () => {
  it('keeps subunits and exact integer digits while changing separators', () => {
    expect(localizeDisplay('0.00000001', 'de-DE')).toBe('0,00000001')
    expect(localizeDisplay('-0.00000001', 'fr-FR')).toBe('-0,00000001')
    expect(localizeDisplay('1.23M', 'de-DE')).toBe('1,23M')
    expect(displayFiat(0.00000123, 'JPY', 150, 'ja-JP')).toContain('0.0001845')
    expect(displayFiat(12.34, 'USD', 1, 'fr-FR')).toContain('12,34')
  })

  it('rejects invalid, stale, or unsupported rate tables without assigning a rate of one', () => {
    const now = Date.parse('2026-09-07T12:00:00Z')
    for (const table of [null, { base: 'EUR', date: '2026-09-07', rates: { JPY: 150 } }, { base: 'USD', date: '2020-01-01', rates: { JPY: 150 } }, { base: 'USD', date: '2026-09-08', rates: { JPY: 150 } }, { base: 'USD', date: '2026-09-07', rates: { JPY: Infinity, VES: 10 } }]) expect(parseFxTable(table, now)).toBeNull()
    expect(parseFxTable({ base: 'USD', date: '2026-09-04', rates: { EUR: 0.9 } }, now)?.rates.JPY).toBeUndefined()
  })

  it('server proxy caches valid rates but never caches an upstream failure', async () => {
    expect((await GET()).headers.get('Cache-Control')).toContain('s-maxage=3600')
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ base: 'EUR', date: '2026-09-07', rates: { JPY: 150 } }))
    const failure = await GET()
    expect(failure.status).toBe(503)
    expect(failure.headers.get('Cache-Control')).toBe('no-store')
  })
})
