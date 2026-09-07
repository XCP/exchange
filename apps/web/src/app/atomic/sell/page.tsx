'use client'

import { Suspense, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useWallet } from '@/lib/wallet/wallet-context'
import { friendlyError } from '@xcp/wallet-sdk'
import { DEX_API_BASE } from '@/utils/constants'
import { parseAmountDraft } from '@xcp/wallet-sdk/amounts'
import { verifySellerPsbt } from '@/utils/atomic-listing'

type SellStatus = 'idle' | 'preparing' | 'signing' | 'submitting' | 'success' | 'error'

export default function SellPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <SellPageInner />
    </Suspense>
  )
}

function SellPageInner() {
  const searchParams = useSearchParams()
  const { address, signPsbt } = useWallet()
  const [status, setStatus] = useState<SellStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Parse prefill from query params
  const utxoParam = searchParams.get('utxo')
  const assetParam = searchParams.get('asset')
  const qtyParam = searchParams.get('qty')
  const longnameParam = searchParams.get('longname')

  const prefillTxid = utxoParam ? utxoParam.split(':')[0] : null
  const prefillVout = utxoParam ? utxoParam.split(':')[1] : null
  const hasPrefill = !!(prefillTxid && assetParam && qtyParam)

  const [utxoTxid, setUtxoTxid] = useState(prefillTxid ?? '')
  const [utxoVout, setUtxoVout] = useState(prefillVout ?? '0')
  const [asset, setAsset] = useState(assetParam ?? '')
  const [assetLongname, setAssetLongname] = useState(longnameParam ?? '')
  const [assetQuantity, setAssetQuantity] = useState(qtyParam ?? '')
  const [priceSats, setPriceSats] = useState('')
  const [expiry, setExpiry] = useState<string>('none')
  const voutDraft = parseAmountDraft(utxoVout, { decimals: 0, maxRaw: 0xffffffffn })
  const quantityDraft = parseAmountDraft(assetQuantity, { decimals: 0, minRaw: 1n })
  const priceDraft = parseAmountDraft(priceSats, { decimals: 0, minRaw: 1n, maxRaw: 2_100_000_000_000_000n })
  const amountsValid = voutDraft.status === 'valid' && quantityDraft.status === 'valid' && priceDraft.status === 'valid'
  const intentVersion = useRef(0)
  useEffect(() => { intentVersion.current++ }, [address, utxoTxid, utxoVout, asset, assetQuantity, priceSats, expiry])
  const retainPaste = (draft: string, setDraft: (text: string) => void) => (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const start = event.currentTarget.selectionStart ?? draft.length
    const end = event.currentTarget.selectionEnd ?? start
    setDraft(draft.slice(0, start) + event.clipboardData.getData('text') + draft.slice(end))
  }

  async function handleSell() {
    if (!address) return
    setError(null)

    if (voutDraft.status !== 'valid' || quantityDraft.status !== 'valid' || priceDraft.status !== 'valid') return
    const vout = Number(voutDraft.raw)
    const qty = quantityDraft.raw.toString()
    const price = priceDraft.raw.toString()
    const version = intentVersion.current

    if (!utxoTxid || !/^[0-9a-f]{64}$/i.test(utxoTxid)) {
      setError('Invalid UTXO txid')
      return
    }
    if (isNaN(vout) || vout < 0) {
      setError('Invalid UTXO vout')
      return
    }
    if (!asset) {
      setError('Asset name is required')
      return
    }

    try {
      // Step 1: Request server to construct seller's PSBT
      setStatus('preparing')
      const prepRes = await fetch(`${DEX_API_BASE}/swaps/prepare-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_address: address,
          utxo_txid: utxoTxid,
          utxo_vout: vout,
          asset,
          asset_quantity: qty,
          price_sats: price,
        }),
      })
      const prepData = await prepRes.json()
      if (!prepRes.ok) {
        throw new Error(prepData.error || prepData.details || 'Failed to prepare listing')
      }
      if (version !== intentVersion.current) { setStatus('idle'); return }
      verifySellerPsbt(prepData.psbt_hex, { txid: utxoTxid, vout, address, price: priceDraft.raw })

      // Step 2: Sign PSBT via wallet extension
      // Seller signs with SIGHASH_SINGLE|ANYONECANPAY (0x83) for atomic swap
      setStatus('signing')
      const SIGHASH_SINGLE_ANYONECANPAY = 0x83
      const signedPsbtHex = await signPsbt(prepData.psbt_hex, undefined, [SIGHASH_SINGLE_ANYONECANPAY])
      if (version !== intentVersion.current) { setStatus('idle'); return }

      // Step 3: Submit signed PSBT to create the listing
      setStatus('submitting')
      const expiryMap: Record<string, number> = {
        '1h': 3600_000,
        '24h': 86400_000,
        '7d': 604800_000,
        '30d': 2592000_000,
      }
      const expiresAt = expiry !== 'none' && expiryMap[expiry]
        ? new Date(Date.now() + expiryMap[expiry]).toISOString()
        : null

      const createRes = await fetch(`${DEX_API_BASE}/swaps/complete-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_address: address,
          utxo_txid: utxoTxid,
          utxo_vout: vout,
          asset,
          asset_longname: assetLongname || null,
          asset_quantity: qty,
          price_sats: price,
          signed_psbt_hex: signedPsbtHex,
          expires_at: expiresAt,
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) {
        throw new Error(createData.error || createData.details || 'Failed to create listing')
      }

      setStatus('success')
    } catch (e) {
      setError(friendlyError(e))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const buttonLabel =
    status === 'preparing' ? 'Preparing...' :
    status === 'signing' ? 'Approve in wallet...' :
    status === 'submitting' ? 'Creating listing...' :
    status === 'success' ? 'Listed!' :
    'Create Listing'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/atomic" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
            Swaps
          </Link>
          <span className="text-zinc-700 text-xs">/</span>
          <span className="text-xs text-zinc-300">List for Sale</span>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h1 className="text-sm font-medium text-zinc-200">List for Sale</h1>
          </div>

          {status === 'success' ? (
            <div className="px-4 py-8 text-center space-y-3">
              <p className="text-green-400 text-sm">Listing created successfully!</p>
              <Link
                href="/atomic"
                className="inline-block px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-sm transition-colors"
              >
                Back to Swap Listings
              </Link>
            </div>
          ) : (
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">UTXO Transaction ID</label>
                <input
                  type="text"
                  value={utxoTxid}
                  onChange={(e) => setUtxoTxid(e.target.value.trim())}
                  placeholder="64-char hex txid..."
                  disabled={hasPrefill}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 font-mono focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">UTXO Vout</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="UTXO Vout"
                    aria-invalid={voutDraft.status !== 'valid'}
                    onPaste={retainPaste(utxoVout, setUtxoVout)}
                    value={utxoVout}
                    onChange={(e) => setUtxoVout(e.target.value)}
                    min={0}
                    disabled={hasPrefill}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Asset Name</label>
                  <input
                    type="text"
                    value={asset}
                    onChange={(e) => setAsset(e.target.value.trim())}
                    placeholder="e.g. PEPECASH"
                    disabled={hasPrefill}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                  />
                </div>
              </div>

              {!hasPrefill && (
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">
                    Asset Longname <span className="text-zinc-700">(optional, for subassets)</span>
                  </label>
                  <input
                    type="text"
                    value={assetLongname}
                    onChange={(e) => setAssetLongname(e.target.value.trim())}
                    placeholder="e.g. PARENT.CHILD"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Quantity (raw units)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Quantity (raw units)"
                    aria-invalid={!!assetQuantity && quantityDraft.status !== 'valid'}
                    onPaste={retainPaste(assetQuantity, setAssetQuantity)}
                    value={assetQuantity}
                    onChange={(e) => setAssetQuantity(e.target.value)}
                    placeholder="Amount"
                    min={1}
                    disabled={hasPrefill}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 font-mono focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Price (sats)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Price (sats)"
                    aria-invalid={!!priceSats && priceDraft.status !== 'valid'}
                    onPaste={retainPaste(priceSats, setPriceSats)}
                    value={priceSats}
                    onChange={(e) => setPriceSats(e.target.value)}
                    placeholder="Total price in sats"
                    min={1}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 font-mono focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <p className="break-all text-[10px] text-zinc-400">Atomic listings transfer the entire UTXO. Quantity is in raw base units; 100000000 raw units equals 1 divisible token.</p>
              {!amountsValid && (priceSats || assetQuantity) && <p role="alert" className="text-[10px] text-amber-400">Enter complete plain integers in range. Price and quantity must be positive; punctuation, signs, and exponents are invalid.</p>}
              {amountsValid && <p className="break-all text-xs text-zinc-300">List all {quantityDraft.canonical} raw units of {asset} for exactly {priceDraft.canonical} sats.</p>}

              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Listing Expiry</label>
                <select
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                >
                  <option value="none">No expiry</option>
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              </div>

              {address && (
                <div className="text-[10px] text-zinc-600">
                  Seller: <span className="font-mono text-zinc-500">{address}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSell}
                  disabled={status !== 'idle' || !address || !amountsValid}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold rounded-sm transition-colors"
                >
                  {buttonLabel}
                </button>
                <Link
                  href="/atomic"
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
