import React, { act, Suspense } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import BuyPage from '@/app/atomic/buy/[id]/page.client'
import { ATOMIC_DELIVERY_UNAVAILABLE, assertAtomicPurchasesAvailable } from '@/utils/atomic-purchase-policy'

const mock = vi.hoisted(() => ({ signPsbt: vi.fn() }))
vi.mock('@/lib/wallet/wallet-context', () => ({ useWallet: () => ({ address: 'buyer', signPsbt: mock.signPsbt }) }))
vi.mock('@/lib/sats-context', () => ({ useSatsMode: () => ({ satsMode: true }) }))
vi.mock('@/lib/hooks/useSwapListing', () => ({ useSwapListing: () => ({ listing: {
  id: 'listing', status: 'active', seller_address: 'seller', price_sats: 1200, asset: 'TOKEN', asset_quantity: 1, utxo_txid: 'ab'.repeat(32), utxo_vout: 0,
}, isLoading: false, error: null }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows the release hold and cannot request or sign an atomic purchase', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  const params = Promise.resolve({ id: 'listing' })
  await act(async () => { render(<Suspense fallback="Loading"><BuyPage params={params} /></Suspense>); await params })
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', ATOMIC_DELIVERY_UNAVAILABLE)
  const purchase = screen.getByRole('button', { name: 'Confirm Purchase' }) as HTMLButtonElement
  expect(purchase.disabled).toBe(true)
  await user.click(purchase)
  expect(fetch).not.toHaveBeenCalled()
  expect(mock.signPsbt).not.toHaveBeenCalled()
  expect(() => assertAtomicPurchasesAvailable()).toThrow(ATOMIC_DELIVERY_UNAVAILABLE)
})
