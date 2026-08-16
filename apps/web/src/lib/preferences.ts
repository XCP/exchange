'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Small things the browser should remember between visits.
 *
 * The line this draws is deliberate: **settings persist, money never does.**
 *
 * A fee rate, a slippage tolerance and an expiry are answers to "how do I
 * like to trade" — the same answer every time, and re-entering them on every
 * navigation is pure friction. An amount or a price is an answer to "what am
 * I doing right now". Restoring a quantity someone typed an hour ago into a
 * form with a live submit button is how you sell the wrong number of things,
 * so nothing on that side of the line is written here.
 *
 * Nothing stored is a secret, and nothing stored is authoritative — a missing
 * or corrupt value falls back to the same default the form would have used
 * with no storage at all.
 */

const PREFIX = 'xcpdex:'

/**
 * Same-tab subscribers.
 *
 * `storage` events only fire in OTHER tabs, so a component that writes a
 * preference would not hear about its own write. Two forms sharing a
 * preference on one page have to stay in step, hence the local set.
 */
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Storage can throw outright — Safari private mode, disabled cookies. */
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key)
    else window.localStorage.setItem(PREFIX + key, value)
  } catch {
    // A preference that cannot be saved is not worth failing a render over.
  }
  notify()
}

/**
 * A preference, read through `useSyncExternalStore`.
 *
 * That hook rather than `useState` + `useEffect` because localStorage does
 * not exist during server rendering. The effect version renders the default,
 * then overwrites it after mount — which flashes, and is the
 * `set-state-in-effect` pattern React now warns about. `getServerSnapshot`
 * expresses the same thing honestly: the server genuinely does not know, so
 * it says so, and React reconciles on hydration without a mismatch.
 *
 * The snapshot is the RAW string. Returning a parsed object would allocate a
 * new value every call and spin the store forever; strings compare by value.
 */
export function usePreference<T>(
  key: string,
  fallback: T,
  /** Rejects anything the form could not survive — corrupt or hand-edited. */
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  )

  const value = useMemo(() => {
    if (raw === null) return fallback
    try {
      const parsed: unknown = JSON.parse(raw)
      return isValid(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }, [raw, fallback, isValid])

  const set = useCallback((next: T) => writeRaw(key, JSON.stringify(next)), [key])

  return [value, set]
}

/** Guards, defined once so every caller validates the same way. */
export const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
export const numberIn =
  (min: number, max: number) =>
  (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
