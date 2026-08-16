import type { PriceEvent } from '@/lib/price-events'

export interface EventCluster {
  /** Stable id, used as the marker id and matched against hoveredObjectId. */
  id: string
  /** The day the marker sits on — the first event in the cluster. */
  day: string
  events: PriceEvent[]
}

/**
 * Group events that would land on top of each other at the current zoom.
 *
 * The threshold has to be in PIXELS, not days. Twelve years across 800px is
 * about five days per pixel, so the six events between 2014 and 2016 are one
 * smudge on the All view and comfortably separate on 1Y — a fixed number of
 * days would either over-group the near view or under-group the far one.
 *
 * Rather than ask the chart for coordinates (which are only available after it
 * has laid out, and change again on every resize), the pixel threshold is
 * converted back into days using the span actually on screen. Same answer,
 * no dependency on render timing.
 *
 * The gap is a little wider than a dot, and no wider. It was 26px, which on
 * the all-time view meant grouping anything within 154 days — so FDCARD and
 * Ethereum's mainnet merged despite sitting 24 pixels and four months apart,
 * plainly separate to the eye. The number should describe when two dots would
 * actually touch, not when they feel close on a calendar.
 */
const MIN_GAP_PX = 12

export function clusterEvents(
  events: PriceEvent[],
  firstDay: string | undefined,
  lastDay: string | undefined,
  widthPx: number,
): EventCluster[] {
  if (!firstDay || !lastDay || widthPx <= 0) return []

  const start = Date.parse(`${firstDay}T00:00:00Z`)
  const end = Date.parse(`${lastDay}T00:00:00Z`)
  if (!(end > start)) return []

  const spanDays = (end - start) / 86_400_000
  const gapDays = (spanDays / widthPx) * MIN_GAP_PX

  // Only what is actually on screen; an event off the left edge has no dot.
  const visible = events
    .filter((e) => {
      const t = Date.parse(`${e.day}T00:00:00Z`)
      return t >= start && t <= end
    })
    .sort((a, b) => a.day.localeCompare(b.day))

  const clusters: EventCluster[] = []
  for (const e of visible) {
    const last = clusters.at(-1)
    const gap = last
      ? (Date.parse(`${e.day}T00:00:00Z`) - Date.parse(`${last.day}T00:00:00Z`)) / 86_400_000
      : Infinity
    // Measured from the cluster's ANCHOR, not the previous event, so a run of
    // closely spaced events cannot chain into one arbitrarily wide group.
    // A `solo` event neither joins a group nor accepts one.
    const mergeable = last && !e.solo && !last.events[0].solo
    if (mergeable && gap < gapDays) last.events.push(e)
    else clusters.push({ id: `evt-${e.day}`, day: e.day, events: [e] })
  }
  return clusters
}
