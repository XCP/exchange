'use client'

import { useEffect, useRef, useState } from 'react'
import { DEX_API_BASE } from '@/utils/constants'

const MAX_BACKOFF_MS = 30_000
const VISITOR_KEY = 'xcpdex:visitor:v1'

/** Derived from the API base so a preview or local API is followed automatically. */
const WS_BASE = DEX_API_BASE.replace(/^http/, 'ws')

/**
 * An opaque id that is stable across this browser's tabs, so three tabs count
 * as one person rather than three.
 *
 * It is a random value with nothing derived from the visitor in it, it is sent
 * only to the presence room, and the server holds it only for as long as the
 * socket is open — it is a deduplication key, not a profile. Falls back to a
 * per-tab value when storage is unavailable (private mode, storage disabled),
 * which degrades to tab-counting rather than failing.
 */
function visitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, fresh)
    return fresh
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * How many people have xcpdex.com open right now — one WebSocket to a single
 * fixed Durable Object (see apps/api's SitePresence), site-wide rather than
 * per-market: a per-market count would mostly read 0 or 1, which says nothing.
 *
 * Renders nothing until the first count arrives, and nothing again if the
 * socket never connects. This is ambience; no other feature depends on it, and
 * it must never be the reason something on the page looks broken. It sits
 * inline in the footer rather than floating over the content, so there is no
 * overlay competing with the trade forms.
 */
export function SitePresenceBadge() {
  const [count, setCount] = useState<number | null>(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    let socket: WebSocket | null = null
    let stopped = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const id = visitorId()

    const connect = () => {
      if (stopped) return
      const ws = new WebSocket(`${WS_BASE}/ws/presence`)
      socket = ws
      ws.onopen = () => {
        attemptRef.current = 0
        // Identify immediately: until this lands the room counts this socket as
        // its own anonymous visitor. Sent on every reconnect too, since a
        // reconnect is a new socket with no memory of the old one.
        ws.send(JSON.stringify({ type: 'hello', id }))
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === 'count') setCount(msg.count)
        } catch {
          // ignore malformed frames
        }
      }
      ws.onclose = () => {
        setCount(null)
        if (stopped) return
        const attempt = attemptRef.current + 1
        attemptRef.current = attempt
        // Exponential backoff so a dead API is not hammered by every open tab.
        retryTimer = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt))
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      socket?.close()
    }
  }, [])

  if (count === null) return null

  /**
   * Fixed to the bottom-left rather than sitting in the footer.
   *
   * It lived in the footer first, which meant it was invisible on /swap,
   * /limit, /buy and /sell — those four suppress the footer entirely, and they
   * are exactly the pages where knowing someone else is around matters most.
   *
   * Bottom-LEFT because the wallet/connect affordances live on the right and
   * this must never sit near something clickable that matters. Fixed so it
   * never reserves layout or shifts the page when the socket answers late.
   */
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40">
      <span
        className="pointer-events-auto inline-flex cursor-default items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/90 px-2.5 py-1 text-[11px] text-zinc-400 shadow-lg backdrop-blur"
        title="People with xcpdex.com open right now, including you. Several tabs from the same browser count once."
      >
        <span aria-hidden className="size-1.5 rounded-full bg-green-500" />
        {count} online
      </span>
    </div>
  )
}
