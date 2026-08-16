import useSWR from 'swr'
import { fetcher } from '@/lib/api/client'
import { assetDispensersUrl, assetDispensesUrl } from '@/lib/api/counterparty'
import { counterpartyUrl } from '@/lib/api/client'
import type { Dispenser, Dispense } from '@/types/trading'
import type { CounterpartyResponse } from '@/types/api'

/**
 * The statuses core actually pays out from: 0 open, 11 open on an empty
 * address (counterparty-core messages/dispense.py). Mainnet holds none at 11
 * today, but it is a first-class protocol status the API validates and any
 * dispenser opened on an empty address lands there.
 */
const DISPENSABLE_STATUSES = new Set([0, 11])

export function useAssetDispensers(asset: string) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Dispenser[]>>(
    asset ? assetDispensersUrl(asset) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    dispensers: data?.result ?? [],
    error,
    isLoading,
  }
}

export function useAssetDispenses(asset: string) {
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Dispense[]>>(
    asset ? assetDispensesUrl(asset) : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  return {
    dispenses: data?.result ?? [],
    error,
    isLoading,
  }
}

/**
 * Every open dispenser at one address.
 *
 * Needed because a dispense pays from ALL of them: core takes the payment and
 * runs `get_dispensers(address, status_in=[0, 11], order_by="asset")`, paying
 * each in turn. Buying "one asset" from an address that runs three dispensers
 * returns three assets and consumes the BTC accordingly — so the form has to
 * know before it quotes a payout.
 */
export function useAddressDispensers(address: string | null) {
  // status=all then filtered here, because core dispenses from BOTH 0 (open)
  // and 11 (open_empty_address) and the API has no single value covering the
  // pair — `status=open` is 0 alone. Under-reporting here would mean a buyer
  // receives an asset the form never mentioned, so the extra rows are worth
  // the filter. An address holds few dispensers, so this stays a small page.
  const { data, error, isLoading } = useSWR<CounterpartyResponse<Dispenser[]>>(
    address
      ? counterpartyUrl(`/addresses/${address}/dispensers?status=all&verbose=true&limit=100`)
      : null,
    fetcher,
    { refreshInterval: 60_000 },
  )

  return {
    dispensers: (data?.result ?? []).filter((d) => DISPENSABLE_STATUSES.has(d.status)),
    error,
    isLoading,
  }
}
