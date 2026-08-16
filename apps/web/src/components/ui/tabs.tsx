'use client'

import { Tabs as T } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * The site's segmented control, in the two shapes it already uses:
 *
 *  - "underline" — the full-width tab bar that sits on top of a table
 *    (Trades / Orders / Holders). Green rule under the active tab.
 *  - "pill" — the compact toggle above a form (Swap / Limit, Buy / Sell).
 *
 * Radix supplies what the hand-rolled bars never had: real tablist
 * semantics, arrow-key navigation, and roving focus.
 */
export const Tabs = T.Root
export const TabsContent = T.Content

export function SegmentedList({
  className = '',
  children,
  variant = 'pill',
  tone = 'onPage',
}: {
  className?: string
  children: ReactNode
  variant?: 'pill' | 'underline'
  /**
   * A groove has to be darker than what it sits in, and these sit in two
   * different things. On the page the track is LIGHTER than the zinc-950
   * background; inside a zinc-900 Panel that same track is the panel's own
   * colour and the control flattens into it, leaving only a hairline border
   * to say it is a control at all.
   */
  tone?: 'onPage' | 'inPanel'
}) {
  const track =
    tone === 'inPanel' ? 'border-zinc-800 bg-zinc-950/60' : 'border-zinc-800 bg-zinc-900/50'
  return (
    <T.List
      className={
        variant === 'pill'
          ? `flex items-center gap-0.5 rounded-sm border ${track} p-0.5 ${className}`
          : `flex border-b border-zinc-800 ${className}`
      }
    >
      {children}
    </T.List>
  )
}

export function SegmentedTrigger({
  value,
  children,
  variant = 'pill',
  grow = true,
  disabled,
  title,
}: {
  value: string
  children: ReactNode
  variant?: 'pill' | 'underline'
  grow?: boolean
  /** For a mode that cannot mean anything yet — see the withdraw tab, which
   *  needs a pool before it has a position to describe. */
  disabled?: boolean
  title?: string
}) {
  return (
    <T.Trigger
      value={value}
      disabled={disabled}
      title={title}
      className={
        variant === 'pill'
          ? `${grow ? 'flex-1 ' : ''}rounded-sm px-3 py-1 text-xs font-medium capitalize text-zinc-500 transition-colors hover:text-zinc-300 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:text-zinc-700`
          : `${grow ? 'flex-1 ' : ''}border-b-2 border-transparent py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300 data-[state=active]:border-green-500 data-[state=active]:text-zinc-100`
      }
    >
      {children}
    </T.Trigger>
  )
}
