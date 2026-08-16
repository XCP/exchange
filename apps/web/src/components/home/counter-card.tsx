'use client'

import { Bone } from './skeletons'

export function CounterCard({
  label,
  value,
  sub,
  loading,
  href,
}: {
  label: string
  value: string
  sub?: string
  loading?: boolean
  /**
   * Makes the whole card a link. For figures that are a claim about one
   * record — a best price IS a particular dispenser — so the reader can go
   * see the thing being quoted. External URLs open in a new tab; a stat card
   * is context, not a destination you want to lose your place to.
   */
  href?: string
}) {
  const external = href?.startsWith('http')
  const Tag = href ? 'a' : 'div'
  return (
    <Tag
      {...(href ? { href, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) } : {})}
      className={`block bg-zinc-900/50 border border-zinc-800 rounded-sm px-4 py-3${
        href ? ' transition-colors hover:border-zinc-700' : ''
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      {loading ? (
        <>
          <Bone className="h-6 w-24 mb-1" />
          <Bone className="h-3 w-16 mt-0.5" />
        </>
      ) : (
        <>
          <div className="text-lg font-mono tabular-nums font-semibold text-zinc-100">{value}</div>
          {sub ? <div className="text-xs text-zinc-500 font-mono tabular-nums mt-0.5">{sub}</div> : <div className="h-3 mt-0.5" />}
        </>
      )}
    </Tag>
  )
}
