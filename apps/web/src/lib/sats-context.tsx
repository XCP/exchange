'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { usePreference, isBool } from '@/lib/preferences'

/**
 * Whether BTC figures are shown in satoshis.
 *
 * A display preference, so it persists like the rest of them. This used to
 * keep its own copy of the storage plumbing: `useState(false)` plus an effect
 * that read localStorage and called `setSatsMode` after mount. That is the
 * pattern React now warns about (`set-state-in-effect`) and it flashed the
 * wrong unit for a frame on every page load, because the first render always
 * claimed BTC before the effect corrected it.
 *
 * `usePreference` answers the same question honestly through
 * `useSyncExternalStore`: the server does not know, says so, and the real
 * value arrives on hydration without a mismatch.
 *
 * Note the storage key changed with this move (`xcpdex-sats-mode` → the
 * shared `xcpdex:satsMode`), so anyone who had sats mode on gets it back at
 * its default once. It is a one-click display toggle; carrying a migration
 * for it would cost more than it saves.
 */

interface SatsContextValue {
  satsMode: boolean
  toggleSatsMode: () => void
}

const SatsContext = createContext<SatsContextValue>({ satsMode: false, toggleSatsMode: () => {} })

export function SatsProvider({ children }: { children: ReactNode }) {
  const [satsMode, setSatsMode] = usePreference('satsMode', false, isBool)

  const value = useMemo(
    () => ({ satsMode, toggleSatsMode: () => setSatsMode(!satsMode) }),
    [satsMode, setSatsMode],
  )

  return <SatsContext value={value}>{children}</SatsContext>
}

export function useSatsMode() {
  return useContext(SatsContext)
}
