'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PoolManagePanel, type PoolManageTab } from '@/components/pool/pool-manage-panel'
import { AssetSelect } from '@/components/asset-select'
import { FormSettings, PoolSlippageSetting, FeeRateSetting } from '@/components/form-settings'
import { useFormSettings } from '@/lib/hooks/useFormSettings'
import { usePoolByPair, usePoolAddressPosition } from '@/lib/hooks/usePools'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useFeeRate } from '@/lib/hooks/useNetworkInfo'

/**
 * Deposit and withdraw, standing on their own.
 *
 * The same panel lives on /swap's Liquidity tab and on every /pool page, but
 * both of those already know which pool you mean. This one does not — and it
 * asks the way every other form asks: XCP in the first leg, the second one
 * open, both adjustable from there. There is no separate pair picker above
 * the card, because the card already has two asset chips and a second row of
 * them would be the same question twice.
 *
 * The URL carries the verb (/liquidity/deposit, /liquidity/withdrawal) so the
 * nav can link straight at one, and the pair after it when there is one. The
 * canonical is the bare /liquidity: all three are the same form, and only one
 * of them should be the page search engines count.
 */

/** URL segment ↔ panel tab. The URL says "withdrawal" because that is what the
 *  nav calls it; the panel says "withdraw" because that is the verb on its
 *  button. Neither should have to bend to the other. */
const TAB_SEGMENT: Record<PoolManageTab, string> = {
  deposit: 'deposit',
  withdraw: 'withdrawal',
}

function segmentToTab(segment: string | undefined): PoolManageTab {
  return segment === 'withdrawal' || segment === 'withdraw' ? 'withdraw' : 'deposit'
}

/** XCP prices almost everything on Counterparty, so it is the pair's first
 *  half until told otherwise — the same default the swap and limit forms use. */
const DEFAULT_A = 'XCP'

type Leg = { name: string; canonical: string }

export default function LiquidityPage() {
  const params = useParams<{ params?: string[] }>()
  const router = useRouter()
  const segments = params.params ?? []

  // [] | [verb] | [verb, A, B]. A bare pair with no verb is not a shape the
  // nav produces, so the first segment is always the verb when present.
  const tab = segmentToTab(segments[0])
  const routeA = segments[1] ? decodeURIComponent(segments[1]) : null
  const routeB = segments[2] ? decodeURIComponent(segments[2]) : null

  const [a, setA] = useState<Leg>({
    name: routeA ?? DEFAULT_A,
    canonical: routeA ?? DEFAULT_A,
  })
  const [b, setB] = useState<Leg | null>(routeB ? { name: routeB, canonical: routeB } : null)
  const [picking, setPicking] = useState<'a' | 'b' | null>(null)

  const { poolSlippage, setPoolSlippage, feeRate, setFeeRate } = useFormSettings()
  const suggestedFee = useFeeRate()
  const { status: walletStatus, address } = useWallet()
  const { pool } = usePoolByPair(a.name, b?.name ?? null)
  const { position } = usePoolAddressPosition(pool?.lp_asset ?? null, address)

  /** Both the verb and the pair live in the path, so a form in progress is a
   *  link. Replace rather than push: choosing through four assets should not
   *  bury the page you arrived from under four back presses. */
  const sync = (nextTab: PoolManageTab, nextA: Leg, nextB: Leg | null) => {
    const parts = [TAB_SEGMENT[nextTab]]
    if (nextB) parts.push(encodeURIComponent(nextA.canonical), encodeURIComponent(nextB.canonical))
    router.replace(`/liquidity/${parts.join('/')}`, { scroll: false })
  }

  const select = (which: 'a' | 'b', asset: string, longname: string | null) => {
    const next: Leg = { name: asset, canonical: longname ?? asset }
    if (which === 'a') {
      setA(next)
      sync(tab, next, b)
    } else {
      setB(next)
      sync(tab, a, next)
    }
    setPicking(null)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-6">
      {/* The gear alone, where the other forms put it. It used to share this
          row with a pair of chips that duplicated the form's own legs. */}
      <div className="mb-3 flex items-center justify-end">
        <FormSettings>
          <PoolSlippageSetting value={poolSlippage} onChange={setPoolSlippage} />
          <FeeRateSetting value={feeRate} onChange={setFeeRate} suggested={suggestedFee} />
        </FormSettings>
      </div>

      <PoolManagePanel
        pool={pool}
        position={position}
        walletStatus={walletStatus}
        address={address}
        slippagePercent={poolSlippage}
        tab={tab}
        onTabChange={(next) => sync(next, a, b)}
        legA={a.name}
        legB={b?.name ?? null}
        onSelectAsset={setPicking}
      />

      {/* No separate create step to send anyone to: depositing into a pair
          that has no pool IS how one gets made, and this form composes that
          same call. So this says what will happen rather than linking away. */}
      {b && !pool && (
        <p className="mt-3 text-center text-xs text-zinc-500">
          No {a.canonical} / {b.canonical} pool yet — the first deposit creates it and sets its
          opening price.
        </p>
      )}

      <AssetSelect
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        onSelect={(asset, longname) => picking && select(picking, asset, longname)}
      />
    </div>
  )
}
