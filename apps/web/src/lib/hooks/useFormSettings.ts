'use client'

import { useState } from 'react'
import { usePreference, isBool, numberIn } from '@/lib/preferences'

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
const isExpiration = numberIn(1, 100_000)

export function useFormSettings() {
  const [slippageAuto, setSlippageAuto] = usePreference('slippage.auto', true, isBool)
  const [customSlippage, setCustomSlippage] = usePreference('slippage.value', 1, isSlippage)
  const [feeRate, setFeeRate] = usePreference('feeRate', 0, isFeeRate)
  const [expiration, setExpiration] = usePreference('expiration', 5000, isExpiration)
  // Pool deposits/withdrawals have their own tolerance — see PoolSlippageSetting
  // on why it is a separate number with no Auto mode.
  const [poolSlippage, setPoolSlippage] = usePreference('pool.slippage', 1, isSlippage)

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
