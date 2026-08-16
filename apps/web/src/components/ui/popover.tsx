'use client'

import { Popover as P } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * A small anchored panel — the settings gear beside a form's tab row.
 *
 * Radix handles the outside-click, Escape, focus return and collision
 * flipping that the hand-rolled dropdowns on this site each re-implement.
 */
export function Popover({
  trigger,
  children,
  align = 'end',
  className = 'w-60',
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <P.Root>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          sideOffset={6}
          className={`z-50 rounded-sm border border-zinc-700 bg-zinc-950 p-3 shadow-xl shadow-black/50 focus:outline-none ${className}`}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}
