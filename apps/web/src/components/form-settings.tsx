'use client'

import { RiSettings3Line } from 'react-icons/ri'
import { Popover } from '@/components/ui/popover'
import { MiniChip } from '@/components/ui/form-kit'

/**
 * The gear beside every form's tab row.
 *
 * Each surface passes the settings it actually has — there is no gear
 * without controls behind it, and no surface with real controls hidden
 * somewhere else. The affordance means the same thing on all four pages.
 */
export function FormSettings({ children }: { children: React.ReactNode }) {
  return (
    <Popover
      trigger={
        <button
          aria-label="Settings"
          className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
        >
          <RiSettings3Line className="text-base" />
        </button>
      }
    >
      <div className="space-y-4">{children}</div>
    </Popover>
  )
}

/**
 * Max slippage — only meaningful where a quote can move under you.
 *
 * Auto is the default because a fixed tolerance is wrong in both directions:
 * 1% abandons a legitimately large trade whose own impact exceeds it, and is
 * needlessly loose on a tiny one. The widget derives the figure from the
 * quote it is showing and reports it back here; see `neededSlippage`.
 */
export function SlippageSetting({
  value,
  onChange,
  auto,
  onAutoChange,
  effective,
}: {
  /** The manual figure. Only in force when `auto` is off. */
  value: number
  onChange: (v: number) => void
  auto: boolean
  onAutoChange: (v: boolean) => void
  /** What is actually being applied right now, auto or not. */
  effective: number
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400">Max slippage</span>
      <div className="mt-2 flex items-center gap-1">
        <MiniChip active={auto} onClick={() => onAutoChange(true)}>
          Auto
        </MiniChip>
        {[0.5, 1, 3].map((s) => (
          <MiniChip
            key={s}
            active={!auto && value === s}
            onClick={() => {
              onChange(s)
              onAutoChange(false)
            }}
          >
            {s}%
          </MiniChip>
        ))}
        <input
          type="number"
          min={0.1}
          max={50}
          step={0.1}
          value={value}
          onChange={(e) => {
            onChange(Math.min(50, Math.max(0.1, Number(e.target.value) || 1)))
            onAutoChange(false)
          }}
          className="w-16 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-right text-[11px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
        {auto
          ? `Auto tracks this trade's own price impact — currently ${effective}%. The trade is abandoned rather than filled if the rate moves further.`
          : 'The trade is abandoned rather than filled if the rate moves further than this.'}
      </p>
    </label>
  )
}

/**
 * Max slippage for a pool deposit or withdrawal.
 *
 * Separate from SlippageSetting because it has no Auto: Auto there is derived
 * from a swap's own price impact, and a deposit has no price impact to read —
 * it is exposed to the reserves moving between compose and confirm, which is
 * a wait, not a size. Offering an "Auto" that could only ever be a constant
 * would be a control pretending to compute something.
 */
export function PoolSlippageSetting({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400">Max slippage</span>
      <div className="mt-2 flex items-center gap-1">
        {[0.5, 1, 2.5].map((s) => (
          <MiniChip key={s} active={value === s} onClick={() => onChange(s)}>
            {s}%
          </MiniChip>
        ))}
        <input
          type="number"
          min={0.1}
          max={50}
          step={0.1}
          value={value}
          onChange={(e) => onChange(Math.min(50, Math.max(0.1, Number(e.target.value) || 1)))}
          className="w-16 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-right text-[11px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
        The floor on what you accept back. Reserves can move between composing and
        confirming; below this the transaction fails rather than filling.
      </p>
    </label>
  )
}

/**
 * How long an unfilled order rests before expiring, in blocks.
 *
 * Blocks rather than time because that is what the protocol stores, but the
 * rough duration is shown alongside — nobody thinks in units of 5000 blocks.
 */
export function ExpirationSetting({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const days = Math.round((value * 10) / 60 / 24)
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400">Expires after</span>
      <div className="mt-2 flex items-center gap-1">
        {[
          [144, '1d'],
          [1008, '1w'],
          [5000, '~5w'],
        ].map(([blocks, label]) => (
          <MiniChip
            key={blocks}
            active={value === blocks}
            onClick={() => onChange(blocks as number)}
          >
            {label}
          </MiniChip>
        ))}
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(Math.max(1, parseInt(e.target.value, 10) || 5000))}
          className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-right text-[11px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
        {value.toLocaleString()} blocks — roughly {days} day{days === 1 ? '' : 's'}.
      </p>
    </label>
  )
}

/**
 * Miner fee rate. Matters most on the dispenser surfaces, where two buyers
 * racing for the same lot are settled by whose transaction confirms first.
 */
export function FeeRateSetting({
  value,
  onChange,
  suggested,
  hint,
}: {
  /** 0 means "use the network rate at compose time". */
  value: number
  onChange: (v: number) => void
  suggested: number | null
  /**
   * What a higher fee actually buys HERE. Left generic by default: the
   * dispenser wording ("goes to whoever confirms first") was hardcoded and so
   * appeared on /swap, /limit and the liquidity gear, describing a race none
   * of them run.
   */
  hint?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400">Fee rate</span>
      <div className="mt-2 flex items-center gap-1">
        <MiniChip active={value === 0} onClick={() => onChange(0)}>
          Auto
        </MiniChip>
        {suggested != null && (
          <>
            <MiniChip active={value === suggested} onClick={() => onChange(suggested)}>
              {suggested}
            </MiniChip>
            <MiniChip active={value === suggested * 2} onClick={() => onChange(suggested * 2)}>
              {suggested * 2} fast
            </MiniChip>
          </>
        )}
        <input
          type="number"
          min={0}
          value={value || ''}
          placeholder="auto"
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className="w-16 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-right text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
        {value === 0
          ? `Auto uses the next-block rate${suggested != null ? ` (~${suggested} sat/vB)` : ''}.`
          : `${value} sat/vB. ${hint ?? 'A higher rate confirms sooner.'}`}
      </p>
    </label>
  )
}
