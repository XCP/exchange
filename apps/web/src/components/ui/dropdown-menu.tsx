'use client'

import Link from 'next/link'
import { DropdownMenu as DM } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * The header's menu primitive.
 *
 * Radix supplies the parts a hand-rolled menu always ends up missing:
 * roving arrow-key focus, Escape and outside-click to close, typeahead,
 * `aria-expanded` on the trigger, focus returning to it on close, and
 * collision flipping near the viewport edge.
 *
 * `asChild` on each item is what keeps Next's `<Link>` — so these are real
 * anchors that prefetch and open in a new tab on middle-click, rather than
 * divs with an onClick.
 */
export function DropdownMenu({
  trigger,
  children,
  align = 'start',
  className = 'w-44',
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={8}
          className={`z-50 rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-xl shadow-black/50 focus:outline-none ${className}`}
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

/** One navigable row. `active` marks the page you are already on. */
export function DropdownLink({
  href,
  active,
  children,
  hint,
}: {
  href: string
  active?: boolean
  children: ReactNode
  /** A few words on what the destination is for. */
  hint?: string
}) {
  return (
    <DM.Item asChild>
      <Link
        href={href}
        className={`flex flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-xs outline-none transition-colors data-[highlighted]:bg-zinc-800 ${
          active ? 'text-zinc-100' : 'text-zinc-400 data-[highlighted]:text-zinc-100'
        }`}
      >
        <span className="font-medium">{children}</span>
        {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
      </Link>
    </DM.Item>
  )
}

export function DropdownSeparator() {
  return <DM.Separator className="my-1 h-px bg-zinc-800" />
}
