'use client'

import type { ReactNode } from 'react'

/**
 * The shared grammar of every table on the site.
 *
 * Tables are most of this site's content, and they had drifted into three
 * dialects. Measured before writing this: row hover was split almost evenly
 * between `hover:bg-zinc-800/50` (24 uses), `hover:bg-zinc-900` (23) and
 * `hover:bg-zinc-700` (10), with three more variants behind them; cell
 * padding ran `px-3 py-1.5` (230), `px-3 py-2` (97) and `px-2 py-1.5` (46);
 * and /portfolio was not using `<table>` at all, but CSS grid, so its columns
 * could not align with anything.
 *
 * None of those differences meant anything — no rule said which table got
 * which. This is the same move `components/ui/form-kit` made for the trading
 * forms: one definition, so a new table inherits the language instead of
 * picking a dialect.
 *
 * Deliberately thin. These are styled primitives, not a data grid: sorting,
 * paging and fetching stay with the page, because every page does them
 * differently for good reasons.
 */

/** The bordered card a table sits in, with horizontal scroll for wide ones. */
export function DataTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/50 ${className}`}>
      {/* Wide tables scroll inside their own card rather than pushing the
          page sideways — the numeric columns are what get cut off, and they
          are the ones worth reaching. */}
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-xs">{children}</table>
      </div>
    </div>
  )
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-zinc-800 text-zinc-500">{children}</tr>
    </thead>
  )
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>
}

type Align = 'left' | 'right'

/**
 * A header cell. `sorted` and `onSort` turn it into a sort control — the
 * arrow and the cursor come with it, so a sortable column cannot look
 * different from page to page.
 */
export function Th({
  children,
  align = 'right',
  onSort,
  sorted,
  order,
  className = '',
}: {
  children: ReactNode
  align?: Align
  onSort?: () => void
  sorted?: boolean
  order?: 'asc' | 'desc'
  /** For responsive hiding, e.g. `max-sm:hidden`. */
  className?: string
}) {
  return (
    <th
      onClick={onSort}
      className={`px-3 py-2 font-normal ${align === 'left' ? 'text-left' : 'text-right'} ${
        onSort ? 'cursor-pointer select-none hover:text-zinc-400' : ''
      } ${sorted ? 'text-zinc-300' : ''} ${className}`}
    >
      {children}
      {sorted && <span aria-hidden> {order === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}

/** A body row. Hover is the affordance that says the row is a link. */
export function Tr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={`border-b border-zinc-800/30 transition-colors last:border-0 hover:bg-zinc-800/50 ${className}`}
    >
      {children}
    </tr>
  )
}

/**
 * A body cell. `num` is the common case on this site and carries the two
 * things a figure always wants: a monospace face so digits line up
 * vertically, and tabular figures so they do not reflow as they tick.
 */
export function Td({
  children,
  align,
  num = false,
  muted = false,
  className = '',
}: {
  children: ReactNode
  align?: Align
  num?: boolean
  /** Secondary figures — counts and timestamps beside a headline number. */
  muted?: boolean
  className?: string
}) {
  const side = align ?? (num ? 'right' : 'left')
  return (
    <td
      className={`px-3 py-1.5 ${side === 'right' ? 'text-right' : 'text-left'} ${
        num ? 'font-mono tabular-nums' : ''
      } ${muted ? 'text-zinc-500' : 'text-zinc-300'} ${className}`}
    >
      {children}
    </td>
  )
}

/**
 * The row a table shows when it has none, and the one it shows while it is
 * finding out. Separated because they are different claims: "there are none"
 * is an answer, "loading" is the absence of one.
 */
export function TableMessage({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-zinc-500">
        {children}
      </td>
    </tr>
  )
}

/** A dash, used everywhere a figure is genuinely absent rather than zero. */
export function Dash() {
  return <span className="text-zinc-600">—</span>
}
