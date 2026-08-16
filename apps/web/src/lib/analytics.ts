'use client'

/**
 * Fathom Analytics — the one place that talks to `window.fathom`.
 *
 * Pageviews are handled in app/fathom.tsx. Everything here is conversions,
 * which the exchange was not reporting at all: the dashboard could say how
 * many people opened /swap and nothing about how many of them traded.
 *
 * Two rules the rest of the app relies on:
 *
 *  - It never throws and never blocks. The script is third-party, it is the
 *    first thing an ad blocker removes, and it does not load on localhost at
 *    all (Fathom needs a real http/https origin). Analytics failing must never
 *    take a broadcast confirmation down with it.
 *  - A conversion fires at most once per transaction. Every broadcast site
 *    reports from an effect keyed on compose status, which React can re-run,
 *    and the user can reload while the same txid is still on screen. `trackTx`
 *    dedupes on the txid, the only identifier genuinely unique per action.
 */

interface Fathom {
  trackEvent: (name: string, opts?: { _value?: number }) => void
}

declare global {
  interface Window {
    fathom?: Fathom
  }
}

/** Fathom takes `_value` in CENTS — $1.23 is 123. */
function cents(usd: number | null | undefined): number | undefined {
  if (usd === null || usd === undefined) return undefined
  if (!Number.isFinite(usd) || usd <= 0) return undefined
  return Math.round(usd * 100)
}

/**
 * Report one event. `usd` is a dollar amount — pass the same figure the user
 * was shown, not a separately derived one, so the dashboard and the screen can
 * never disagree.
 */
export function trackEvent(name: string, usd?: number | null): void {
  if (typeof window === 'undefined' || !window.fathom) return
  try {
    const value = cents(usd)
    window.fathom.trackEvent(name, value === undefined ? undefined : { _value: value })
  } catch {
    // A blocked or half-initialised script is not an error worth surfacing.
  }
}

const SEEN_KEY = 'xcpdex:tracked:v1'

/** Identifiers already reported, so a re-render or a reload can't double-count. */
function seen(): Set<string> {
  try {
    return new Set<string>(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function remember(id: string): boolean {
  const already = seen()
  if (already.has(id)) return false
  already.add(id)
  try {
    // Bounded: this only has to outlive the tab, and a session that broadcast
    // 100 transactions has bigger things going on than a stale dedupe entry.
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...already].slice(-100)))
  } catch {
    // Private mode with no storage quota — fall through and still report.
  }
  return true
}

/**
 * Report a conversion for a broadcast transaction, exactly once.
 *
 * Deduped on txid rather than on a render-scoped ref: the effects that call
 * this re-run on unrelated dependency changes, and a confirmed action stays on
 * screen across a reload.
 */
export function trackTx(
  txid: string | null | undefined,
  name: string,
  usd?: number | null,
): void {
  if (!txid || typeof window === 'undefined') return
  if (!remember(txid)) return
  trackEvent(name, usd)
}

/**
 * The wallet funnel, which is the part of this site most worth measuring.
 *
 * Every trade needs a signature, so the wallet is the gate everything else is
 * behind — and the interesting number is not how many people connect, it is
 * how many try and cannot. `wallet missing` fires when the connect button
 * finds no extension installed, which is a conversion problem no pageview
 * report can show.
 *
 * Deduped per session on the reason rather than on a txid: someone clicking
 * connect four times is one frustrated visitor, not four data points.
 */
export function trackWallet(event: 'connected' | 'missing' | 'rejected', address?: string | null): void {
  const id = event === 'connected' && address ? `wallet:${address}` : `wallet:${event}`
  if (typeof window === 'undefined') return
  if (!remember(id)) return
  trackEvent(`wallet ${event}`)
}
