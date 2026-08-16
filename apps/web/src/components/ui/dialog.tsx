'use client'

import { Dialog as D } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * The site's one modal shape: a centered panel under a dimmed backdrop.
 *
 * Radix supplies what the hand-rolled modals lacked — focus trapping,
 * Escape, scroll lock, focus return to the trigger, and the aria wiring.
 * Content unmounts on close, so per-open state (an asset search box) resets
 * for free rather than needing to be cleared by hand.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = 'max-w-sm',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Screen-reader context when the panel's purpose isn't obvious from its title. */
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <D.Content
          className={`fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] ${className} -translate-x-1/2 rounded-sm border border-zinc-700 bg-zinc-950 shadow-xl shadow-black/50 focus:outline-none`}
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <D.Title className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              {title}
            </D.Title>
            <D.Close
              aria-label="Close"
              className="flex size-6 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              ✕
            </D.Close>
          </div>
          {description ? (
            <D.Description className="sr-only">{description}</D.Description>
          ) : (
            // Radix warns when Content has no description; opt out explicitly
            // rather than shipping a hidden paragraph that says nothing.
            <D.Description asChild>
              <span className="sr-only">{title}</span>
            </D.Description>
          )}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
