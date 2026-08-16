'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'
import { XCP_IMG_BASE } from '@/utils/constants'

/**
 * The shared grammar of the trading forms — one card, hairline-divided
 * sections, a big light numeral per section with its asset on the right.
 *
 * Every piece here exists because all three surfaces (swap, limit,
 * dispense) draw the same shapes; keeping them in one file is what stops
 * the three pages from drifting into three slightly different forms.
 */

/** The card every form lives in. Reads as a surface lifted off the page. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 ${className}`}>
      {children}
    </div>
  )
}

/** One hairline-separated block inside a Panel. */
export function PanelSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border-b border-zinc-800 px-5 py-4 last:border-b-0 ${className}`}>{children}</div>
}

/**
 * A labelled amount: the label row, the numeral, and the asset on the
 * right. `value` being a node rather than a string lets the read-only
 * sides (a quote, a total) render the same shape without an input.
 */
export function AmountField({
  label,
  meta,
  value,
  onChange,
  readOnly,
  chip,
  sub,
  placeholder = '0',
  dim,
}: {
  label: string
  /** Right of the label — presets, balance, price hints. */
  meta?: ReactNode
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  chip: ReactNode
  /** Under the numeral — the fiat approximation, or a warning. */
  sub?: ReactNode
  placeholder?: string
  /**
   * Drain the colour out of the value because it no longer describes what is
   * on screen — a quote being re-fetched for a different amount. Better than
   * blanking it: the old number stays readable as a reference while it is
   * visibly not the answer yet.
   */
  dim?: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-500">{label}</span>
        {meta}
      </div>
      <div className="flex items-center gap-3">
        {readOnly ? (
          <span
            className={`min-w-0 flex-1 truncate text-4xl font-light tabular-nums ${
              value && value !== '0' ? 'text-zinc-100' : 'text-zinc-600'
            }`}
            style={{
              opacity: dim ? 0.35 : 1,
              // No fade INTO the dim state: the value stops being true the
              // instant the amount changes, so easing there would be a lie.
              transition: dim ? 'none' : 'opacity 250ms ease-in-out',
            }}
          >
            {value || placeholder}
          </span>
        ) : (
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange?.(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-4xl font-light tabular-nums text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        )}
        <div className="shrink-0">{chip}</div>
      </div>
      {sub && <div className="mt-1.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}

/** The rounded-full asset pill. A button when it can be changed, plain text when it can't. */
export function AssetChip({
  asset,
  label,
  onClick,
}: {
  asset: string
  label?: string
  onClick?: () => void
}) {
  /**
   * Never a broken image.
   *
   * Two ways it used to break: an empty `asset` (the LP chip before a pool is
   * resolved) requested `/icon/` and 404'd, and plenty of real assets simply
   * have no artwork on the CDN. Both rendered the browser's torn-page glyph,
   * which reads as a bug in the page rather than as a token without a picture.
   *
   * The fallback is a monogram in the chip's own palette, so a missing icon
   * looks deliberate.
   */
  const [broken, setBroken] = useState(false)
  const icon =
    asset && !broken ? (
      <Image
        src={`${XCP_IMG_BASE}/icon/${asset}`}
        alt=""
        width={20}
        height={20}
        className="size-5 rounded-full object-cover"
        sizes="20px"
        unoptimized
        onError={() => setBroken(true)}
      />
    ) : (
      <span
        aria-hidden
        className="flex size-5 items-center justify-center rounded-full bg-zinc-700 text-[9px] font-bold text-zinc-400"
      >
        {(label ?? asset ?? '?').slice(0, 2).toUpperCase()}
      </span>
    )

  const inner = (
    <>
      {icon}
      <span className="max-w-[9rem] truncate">{label ?? asset}</span>
      {onClick && <span className="text-zinc-500">▾</span>}
    </>
  )

  const className =
    'flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 py-1.5 pl-1.5 pr-3 text-sm font-medium text-zinc-100'

  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} transition-colors hover:border-zinc-500`}>
      {inner}
    </button>
  ) : (
    <span className={className}>{inner}</span>
  )
}

/**
 * The chip for a leg nothing has been picked for yet.
 *
 * Loud on purpose. With one side empty the form can't quote, price or
 * submit, so choosing an asset is the only move available — the same reason
 * Uniswap paints its unselected side in the brand colour and leaves the
 * chosen side a quiet pill. Once something is picked this becomes an
 * ordinary AssetChip and the accent goes back to the submit button.
 */
export function SelectAssetChip({
  onClick,
  label = 'Select',
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-full bg-green-500 py-2 pl-3.5 pr-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-green-400"
    >
      <span>{label}</span>
      <span className="text-zinc-950/50">▾</span>
    </button>
  )
}

/**
 * The circular direction toggle that straddles the divider between two
 * amount fields. Negative margins pull the sections together so it reads
 * as sitting on the seam rather than in a row of its own.
 */
export function FlipButton({ onClick }: { onClick: () => void }) {
  // A FULL turn per press, not a half. The arrow is a label as much as a
  // control — it says "this is where the value below comes from" — so it has
  // to come to rest pointing down every time. Accumulating whole turns also
  // keeps it spinning the same direction however many times it's pressed,
  // where toggling would unwind backwards on every second press.
  const [flips, setFlips] = useState(0)

  return (
    <div className="relative z-10 -my-4 flex justify-center">
      <button
        type="button"
        onClick={() => {
          setFlips((f) => f + 1)
          onClick()
        }}
        aria-label="Flip direction"
        className="flex size-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 shadow-lg shadow-black/40 transition-colors hover:border-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 active:scale-95"
      >
        <span
          className="inline-flex transition-transform duration-300"
          style={{ transform: `rotate(${flips * 360}deg)` }}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </span>
      </button>
    </div>
  )
}

/** The full-width action at the foot of every form. */
export function CTA({
  children,
  onClick,
  disabled,
  tone = 'primary',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  /**
   * 'muted' keeps the button live but drops it out of the accent colour, for
   * when something else on the card is the actual next step — an unpicked
   * asset chip. Two saturated greens would give a visitor two answers to
   * "what do I do here", and only one of them is right.
   */
  tone?: 'primary' | 'sell' | 'muted'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl py-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'sell'
          ? 'bg-red-500 text-white hover:bg-red-400 disabled:hover:bg-red-500'
          : tone === 'muted'
            ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:hover:bg-green-500/15'
            : 'bg-green-500 text-zinc-950 hover:bg-green-400 disabled:hover:bg-green-500'
      }`}
    >
      {children}
    </button>
  )
}

/** Small square-ish chips used for presets (Market, −1%, 25%, …). */
export function MiniChip({
  children,
  onClick,
  active,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
        active
          ? 'border-green-500/40 bg-green-500/10 text-green-400'
          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

/** Share-of-balance shortcuts. 100 reads as "Max" — nobody says "100%". */
export const BALANCE_PRESETS = [25, 50, 75, 100] as const

/**
 * The quick-fill row that sits on an amount field's label line.
 *
 * Only the labels and the "100 is Max" rule are shared. The arithmetic
 * deliberately is not: on the swap form a percentage is a share of the
 * balance, while on a limit BUY it is a share of the balance divided by the
 * price, because the balance being spent is the quote and the field being
 * filled is the base. Folding those into one helper would need a flag that
 * changes what the number means.
 *
 * Callers render this only when there is something to take a share of — no
 * wallet, an unknown divisibility or a zero balance and the row is absent
 * rather than offering buttons that do nothing.
 */
export function BalancePresets({ onPick }: { onPick: (pct: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {BALANCE_PRESETS.map((p) => (
        <MiniChip key={p} onClick={() => onPick(p)}>
          {p === 100 ? 'Max' : `${p}%`}
        </MiniChip>
      ))}
    </div>
  )
}
