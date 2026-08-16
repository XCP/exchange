'use client'

import { useEffect, useState } from 'react'

/**
 * How fresh the quote on screen is, as a draining ring.
 *
 * A swap quote goes stale on its own — the pool moves, the book gets taken —
 * so the form re-fetches on a timer. Without this the numbers just change
 * under you with no warning; the ring makes the timer something you can see,
 * which is the difference between "the price jumped" and "the price is a
 * minute old and about to update".
 *
 * `pathLength={100}` normalises the circle so the dash maths is a plain
 * percentage instead of 2πr. The stroke transition is 1s to match the 1Hz
 * tick, which turns a discrete counter into a continuous sweep.
 *
 * While a fetch is actually in flight the ring pulses and empties rather
 * than continuing to count down — the honest state is "fetching", not a
 * countdown to a moment that has already passed.
 */
export function QuoteRing({
  periodMs,
  lastUpdated,
  fetching,
}: {
  periodMs: number
  lastUpdated: number | null
  fetching: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (!lastUpdated) return null
  const remaining = Math.max(0, 100 - ((now - lastUpdated) / periodMs) * 100)

  return (
    <svg
      viewBox="0 0 20 20"
      className={`size-[18px] -rotate-90 ${fetching ? 'animate-pulse' : ''}`}
      aria-label="Quote refresh countdown"
    >
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2" className="stroke-zinc-800" />
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={fetching ? 100 : 100 - remaining}
        className="stroke-green-500"
        style={{ transition: fetching ? 'none' : 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  )
}
