'use client'

import { useState } from 'react'
import { usePreference, isBool, numberIn } from '@/lib/preferences'
import { validExpiration } from '@/utils/form-settings'

/**
 * The four values behind every form's gear, held in one place.
 *
 * They were four `useState` declarations repeated across /swap, /limit, the
 * dispense surface and the asset page's trade rail — the same defaults
 * written out four times, and all of them forgotten the moment you navigated.
 * Setting a fee rate of 5 sat/vB and then switching from Swap to Limit put it
 * straight back to "network median" with no indication it had.
 *
 * Persisted, because these are preferences and not inputs — see the note in
 * lib/preferences on why amounts deliberately are not.
 *
 * `autoSlippage` is the exception that proves it: it is a number derived from
 * the quote currently on screen, so it is plain state. Persisting it would
 * mean opening tomorrow's form with yesterday's price impact baked in.
 */

/** Ranges are validation, not UI limits — they reject a hand-edited store. */
const isSlippage = numberIn(0.01, 50)
/** 0 means "network median at compose time", which is the default. */
const isFeeRate = numberIn(0, 10_000)
/** Counterparty order expiry, in blocks. */
const isExpiration = (value: unknown): value is number => typeof value === 'number' && validExpiration(value)

/** Invalid drafts stay in this mounted form as NaN, which disables its
 * transaction gates. Only valid preferences are written to storage. */
function useNumericSetting(key: string, fallback: number, valid: (value: unknown) => value is number) {
  const [saved, save] = usePreference(key, fallback, valid)
  const [draft, setDraft] = useState<number | null>(null)
  const set = (next: number) => {
    setDraft(next)
    if (valid(next)) save(next)
  }
  return [draft ?? saved, set] as const
}

export function useFormSettings() {
  const [slippageAuto, setSlippageAuto] = usePreference('slippage.auto', true, isBool)
  const [customSlippage, setCustomSlippage] = useNumericSetting('slippage.value', 1, isSlippage)
  const [feeRate, setFeeRate] = useNumericSetting('feeRate', 0, isFeeRate)
  const [expiration, setExpiration] = useNumericSetting('expiration', 5000, isExpiration)
  // Pool deposits/withdrawals have their own tolerance — see PoolSlippageSetting
  // on why it is a separate number with no Auto mode.
  const [poolSlippage, setPoolSlippage] = useNumericSetting('pool.slippage', 1, isSlippage)

  // Reported back by the widget from the live quote. Never persisted.
  const [autoSlippage, setAutoSlippage] = useState(1)

  return {
    slippageAuto,
    setSlippageAuto,
    customSlippage,
    setCustomSlippage,
    autoSlippage,
    setAutoSlippage,
    /** What is actually in force right now, auto or manual. */
    slippage: slippageAuto ? autoSlippage : customSlippage,
    poolSlippage,
    setPoolSlippage,
    feeRate,
    setFeeRate,
    expiration,
    setExpiration,
  }
}
