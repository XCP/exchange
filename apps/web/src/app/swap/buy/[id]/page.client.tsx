'use client'

import { use, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSwapListing } from '@/lib/hooks/useSwapListing'
import { useWallet } from '@/lib/wallet/wallet-context'
import { useSatsMode } from '@/lib/sats-context'
import { formatAddress } from '@/utils/format-address'
import { formatAmount } from '@/utils/format-amount'
import { formatPrice } from '@/utils/format-price'
import { DEX_API_BASE, XCP_IMG_BASE } from '@/utils/constants'

type BuyStatus = 'idle' | 'preparing' | 'signing' | 'submitting' | 'success' | 'error'

export default function BuyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { satsMode } = useSatsMode()
  const { address, signPsbt } = useWallet()
  const { listing, isLoading, error: fetchError } = useSwapListing(id)

  const [status, setStatus] = useState<BuyStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [platformFee, setPlatformFee] = useState<number | null>(null)

  async function handleBuy() {
    if (!address || !listing) return
    setError(null)

    try {
      // Step 1: Request server to construct buyer's PSBT
      setStatus('preparing')
      const prepRes = await fetch(`${DEX_API_BASE}/swaps/${listing.id}/prepare-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_address: address }),
      })
      const prepData = await prepRes.json()
      if (!prepRes.ok) {
        throw new Error(prepData.error || prepData.details || 'Failed to prepare fill')
      }

      const { fill_request_id, psbt_hex, buyer_input_indices, platform_fee_sats } = prepData
      setPlatformFee(platform_fee_sats ?? 0)

      // Step 2: Sign PSBT via wallet extension
      // Only sign buyer's inputs (not the seller's input 0)
      setStatus('signing')
      const signInputs = buyer_input_indices?.length
        ? { [address]: buyer_input_indices as number[] }
        : undefined
      const signedPsbtHex = await signPsbt(psbt_hex, signInputs)

      // Step 3: Submit signed PSBT to server for merge + broadcast
      setStatus('submitting')
      const fillRes = await fetch(`${DEX_API_BASE}/swaps/${listing.id}/complete-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fill_request_id,
          signed_psbt_hex: signedPsbtHex,
        }),
      })
      const fillData = await fillRes.json()
      if (!fillRes.ok) {
        throw new Error(fillData.error || fillData.details || 'Fill failed')
      }

      setTxId(fillData.tx_id)
      setStatus('success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      if (msg.includes('User cancelled') || msg.includes('User denied') || msg.includes('User rejected')) {
        setError('Transaction cancelled')
      } else {
        setError(msg)
      }
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const buttonLabel =
    status === 'preparing' ? 'Preparing...' :
    status === 'signing' ? 'Approve in wallet...' :
    status === 'submitting' ? 'Broadcasting...' :
    status === 'success' ? 'Filled!' :
    'Confirm Purchase'

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/swap" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
              Swaps
            </Link>
            <span className="text-zinc-700 text-xs">/</span>
            <span className="text-xs text-zinc-300">Buy</span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl">
            <div className="px-4 py-12 text-center">
              <span className="text-xs text-zinc-500">Loading listing...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Not found / fetch error
  if (fetchError || !listing) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/swap" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
              Swaps
            </Link>
            <span className="text-zinc-700 text-xs">/</span>
            <span className="text-xs text-zinc-300">Buy</span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl">
            <div className="px-4 py-12 text-center space-y-3">
              <p className="text-zinc-400 text-sm">Listing not found</p>
              <Link
                href="/swap"
                className="inline-block px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-sm transition-colors"
              >
                Back to Swap Listings
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Not active (filled, cancelled, expired, etc.)
  if (listing.status !== 'active' && status === 'idle') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/swap" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
              Swaps
            </Link>
            <span className="text-zinc-700 text-xs">/</span>
            <span className="text-xs text-zinc-300">Buy</span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl">
            <div className="px-4 py-12 text-center space-y-3">
              <p className="text-zinc-400 text-sm">This listing is no longer available</p>
              <p className="text-zinc-600 text-xs">Status: {listing.status}</p>
              <Link
                href="/swap"
                className="inline-block px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-sm transition-colors"
              >
                Back to Swap Listings
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const totalPriceBtc = listing.price_sats / 1e8
  const unitPrice = listing.price_sats / listing.asset_quantity

  const isOwnListing = address === listing.seller_address
  const canBuy = address && !isOwnListing && status === 'idle'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/swap" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
            Swaps
          </Link>
          <span className="text-zinc-700 text-xs">/</span>
          <span className="text-xs text-zinc-300">Buy</span>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h1 className="text-sm font-medium text-zinc-200">Buy Swap</h1>
          </div>

          {/* Listing details */}
          <div className="px-4 py-3 border-b border-zinc-800 space-y-2">
            <div className="flex items-center gap-2">
              <Image
                src={`${XCP_IMG_BASE}/icon/${listing.asset}`}
                alt=""
                width={20}
                height={20}
                className="rounded-sm"
                unoptimized
              />
              <span className="text-sm font-medium text-zinc-200">
                {listing.asset_longname ?? listing.asset}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-zinc-500">Quantity</span>
                <div className="text-zinc-200 font-mono">{formatAmount(listing.asset_quantity)}</div>
              </div>
              <div>
                <span className="text-zinc-500">Total Price</span>
                <div className="text-zinc-200 font-mono">
                  {satsMode
                    ? `${listing.price_sats.toLocaleString()} sats`
                    : `${formatPrice(totalPriceBtc, false)} BTC`}
                </div>
              </div>
              <div>
                <span className="text-zinc-500">Unit Price</span>
                <div className="text-zinc-400 font-mono">
                  {satsMode
                    ? `${unitPrice < 1 ? unitPrice.toPrecision(2) : Math.round(unitPrice).toLocaleString()} sats`
                    : `${formatPrice(unitPrice / 1e8, false)} BTC`}
                </div>
              </div>
              <div>
                <span className="text-zinc-500">Seller</span>
                <div className="text-zinc-400 font-mono">{formatAddress(listing.seller_address)}</div>
              </div>
            </div>

            <div className="text-[10px] text-zinc-600">
              UTXO: {listing.utxo_txid.slice(0, 12)}...:{listing.utxo_vout}
            </div>

            {platformFee !== null && platformFee > 0 && (
              <div className="text-[10px] text-zinc-600 pt-1 border-t border-zinc-800/50">
                Platform fee: <span className="font-mono text-zinc-500">{platformFee.toLocaleString()} sats</span>
                <span className="text-zinc-700"> ({platformFee >= Math.floor(listing.price_sats * 0.02) ? '2%' : 'minimum'})</span>
              </div>
            )}
          </div>

          {/* Buy action area */}
          {status === 'success' ? (
            <div className="px-4 py-6 text-center space-y-3">
              {txId && (
                <p className="text-green-400 text-sm">
                  Transaction broadcast!{' '}
                  <a
                    href={`https://mempool.space/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {txId.slice(0, 12)}...
                  </a>
                </p>
              )}
              <Link
                href="/swap"
                className="inline-block px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-sm transition-colors"
              >
                Back to Swap Listings
              </Link>
            </div>
          ) : (
            <div className="px-4 py-3 space-y-2">
              {address && (
                <div className="text-[10px] text-zinc-600">
                  Buyer: <span className="font-mono text-zinc-500">{address}</span>
                </div>
              )}

              {isOwnListing && (
                <p className="text-yellow-500 text-[10px]">Cannot buy your own listing</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleBuy}
                  disabled={!canBuy}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold rounded-sm transition-colors"
                >
                  {buttonLabel}
                </button>
                <Link
                  href="/swap"
                  className={`px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium rounded-sm transition-colors ${
                    status === 'preparing' || status === 'signing' || status === 'submitting'
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }`}
                >
                  Cancel
                </Link>
              </div>

              {error && <p className="text-red-400 text-[10px]">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
