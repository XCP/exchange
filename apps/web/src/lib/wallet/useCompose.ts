'use client'

import { useCallback, useRef, useState } from 'react'
import { useWallet } from './wallet-context'
import { COUNTERPARTY_API_BASE } from '@/utils/constants'

type ComposeStatus = 'idle' | 'composing' | 'signing' | 'broadcasting' | 'confirmed' | 'error'

interface ComposeState {
  status: ComposeStatus
  txid: string | null
  error: string | null
}

/** Fetch next-block median fee rate from mempool.space (cached 30s) */
let cachedFeeRate: number | null = null
let feeRateTimestamp = 0

async function getFeeRate(): Promise<number> {
  const now = Date.now()
  if (cachedFeeRate && now - feeRateTimestamp < 30_000) return cachedFeeRate
  try {
    const res = await fetch('https://mempool.space/api/v1/fees/mempool-blocks')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: { medianFee: number }[] = await res.json()
    cachedFeeRate = Math.max(Math.round(data[0]?.medianFee ?? 3), 1)
    feeRateTimestamp = now
    return cachedFeeRate
  } catch {
    return cachedFeeRate ?? 3
  }
}

/** Call Counterparty compose endpoint (GET with query params) */
async function composeRequest(
  address: string,
  type: string,
  params: Record<string, string | number>
): Promise<string> {
  const feeRate = await getFeeRate()
  const qp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    qp.set(k, String(v))
  }
  qp.set('exclude_utxos_with_balances', 'true')
  qp.set('sat_per_vbyte', String(feeRate))
  qp.set('verbose', 'true')

  const url = `${COUNTERPARTY_API_BASE}/addresses/${address}/compose/${type}?${qp.toString()}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const data = await res.json()

  if (!res.ok || data.error) {
    throw new Error(data.error || `Compose failed: ${res.status}`)
  }

  return data.result.rawtransaction
}

/** Parse wallet/compose errors into user-friendly messages */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)

  if (msg.includes('User cancelled') || msg.includes('User denied') || msg.includes('User rejected'))
    return 'Transaction cancelled'
  if (msg.includes('WALLET_LOCKED') || msg.includes('Wallet is locked'))
    return 'Wallet is locked — please unlock and try again'
  if (msg.includes('insufficient') || msg.includes('Insufficient'))
    return 'Insufficient balance'
  if (msg.includes('timeout') || msg.includes('Timeout'))
    return 'Request timed out — please try again'
  if (msg.includes('Rate limit'))
    return 'Too many requests — please wait a moment'
  if (msg.includes('dust'))
    return 'Amount too small (below dust limit)'

  return msg
}

/** Call Counterparty compose endpoint for UTXO-based operations */
async function composeUtxoRequest(
  utxo: string,
  type: string,
  params: Record<string, string | number>
): Promise<string> {
  const feeRate = await getFeeRate()
  const qp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    qp.set(k, String(v))
  }
  qp.set('sat_per_vbyte', String(feeRate))
  qp.set('verbose', 'true')

  const url = `${COUNTERPARTY_API_BASE}/utxos/${utxo}/compose/${type}?${qp.toString()}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const data = await res.json()

  if (!res.ok || data.error) {
    throw new Error(data.error || `Compose failed: ${res.status}`)
  }

  return data.result.rawtransaction
}

export function useCompose() {
  const { address, signTransaction, broadcastTransaction } = useWallet()
  const [state, setState] = useState<ComposeState>({ status: 'idle', txid: null, error: null })
  const busyRef = useRef(false)

  const execute = useCallback(async (type: string, params: Record<string, string | number>) => {
    if (!address) {
      setState({ status: 'error', txid: null, error: 'Wallet not connected' })
      return
    }
    if (busyRef.current) return
    busyRef.current = true

    try {
      setState({ status: 'composing', txid: null, error: null })
      const unsignedHex = await composeRequest(address, type, params)

      setState({ status: 'signing', txid: null, error: null })
      const signedHex = await signTransaction(unsignedHex)

      setState({ status: 'broadcasting', txid: null, error: null })
      const txid = await broadcastTransaction(signedHex)

      setState({ status: 'confirmed', txid, error: null })
    } catch (e) {
      setState({ status: 'error', txid: null, error: friendlyError(e) })
    } finally {
      busyRef.current = false
    }
  }, [address, signTransaction, broadcastTransaction])

  const composeOrder = useCallback((params: {
    give_asset: string
    give_quantity: number
    get_asset: string
    get_quantity: number
    expiration?: number
  }) => execute('order', {
    give_asset: params.give_asset,
    give_quantity: params.give_quantity,
    get_asset: params.get_asset,
    get_quantity: params.get_quantity,
    expiration: params.expiration ?? 5000,
    fee_required: 0,
  }), [execute])

  const composeDispenser = useCallback((params: {
    asset: string
    give_quantity: number
    escrow_quantity: number
    mainchainrate: number
    status?: number
  }) => execute('dispenser', {
    asset: params.asset,
    give_quantity: params.give_quantity,
    escrow_quantity: params.escrow_quantity,
    mainchainrate: params.mainchainrate,
    status: params.status ?? 0,
  }), [execute])

  const composeDispense = useCallback((params: {
    dispenser: string
    quantity: number
  }) => execute('dispense', {
    dispenser: params.dispenser,
    quantity: params.quantity,
  }), [execute])

  const executeUtxo = useCallback(async (utxo: string, type: string, params: Record<string, string | number>) => {
    if (!address) {
      setState({ status: 'error', txid: null, error: 'Wallet not connected' })
      return
    }
    if (busyRef.current) return
    busyRef.current = true

    try {
      setState({ status: 'composing', txid: null, error: null })
      const unsignedHex = await composeUtxoRequest(utxo, type, params)

      setState({ status: 'signing', txid: null, error: null })
      const signedHex = await signTransaction(unsignedHex)

      setState({ status: 'broadcasting', txid: null, error: null })
      const txid = await broadcastTransaction(signedHex)

      setState({ status: 'confirmed', txid, error: null })
    } catch (e) {
      setState({ status: 'error', txid: null, error: friendlyError(e) })
    } finally {
      busyRef.current = false
    }
  }, [address, signTransaction, broadcastTransaction])

  const composeAttach = useCallback((params: {
    asset: string
    quantity: number
  }) => execute('attach', {
    asset: params.asset,
    quantity: params.quantity,
  }), [execute])

  const composeDetach = useCallback((utxo: string) =>
    executeUtxo(utxo, 'detach', {}), [executeUtxo])

  const reset = useCallback(() => {
    setState({ status: 'idle', txid: null, error: null })
  }, [])

  return {
    ...state,
    composeOrder,
    composeDispenser,
    composeDispense,
    composeAttach,
    composeDetach,
    reset,
  }
}
