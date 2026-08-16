import { useEffect, useState } from 'react'

/**
 * Hold a value still until it stops changing.
 *
 * Used for the amount driving a swap quote: every keystroke of "1000" would
 * otherwise fire four quotes, three of them for amounts nobody asked about,
 * and the answers can land out of order. Waiting for a pause means one
 * request for the number actually typed.
 *
 * The caller compares the live value against the debounced one to know a
 * quote is pending — that comparison is what greys the output while the
 * number on screen no longer matches the number it was priced from.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])

  return settled
}
