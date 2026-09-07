// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeAndBroadcast, configureWalletSdk, type ComposeSigner } from '@xcp/wallet-sdk'
import { toBase, totalToBase } from '@/utils/numeric'

const signer: ComposeSigner = {
  address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT', publicKey: null, connectionProof: null,
  signTransaction: vi.fn(), broadcastTransaction: vi.fn(),
}
let urls: string[]
beforeEach(() => {
  urls = []
  configureWalletSdk({ counterpartyApiBase: 'https://fixture.invalid/v2', storage: null })
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url))
    // Stop at the HTTP boundary: no transaction is composed, signed, or sent.
    return new Response(JSON.stringify({ error: 'fixture boundary reached' }), { status: 400 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Exchange intent through the installed SDK HTTP serializer', () => {
  it('keeps the exact typed amount and fractional miner fee in the compose URL', async () => {
    const amount = toBase('100000000.00000001', true)
    const total = totalToBase('1', '100000000.00000001', true)
    if (!amount.ok || !total.ok) throw new Error('valid fixture was rejected')
    await expect(composeAndBroadcast(signer, 'order', {
      give_asset: 'ASSET', give_quantity: amount.base,
      get_asset: 'XCP', get_quantity: total.base, expiration: 5000, fee_required: 0,
    }, { feeRate: 1.56 })).rejects.toThrow('fixture boundary reached')
    expect(urls).toHaveLength(1)
    const url = new URL(urls[0])
    expect(url.searchParams.get('give_quantity')).toBe('10000000000000001')
    expect(url.searchParams.get('get_quantity')).toBe('10000000000000001')
    expect(url.searchParams.get('sat_per_vbyte')).toBe('1.56')
    expect(signer.signTransaction).not.toHaveBeenCalled()
  })
  it('keeps indivisible hundreds through pool compose serialization', async () => {
    const amount = toBase('100', false)
    if (!amount.ok) throw new Error('valid fixture was rejected')
    await expect(composeAndBroadcast(signer, 'pooldeposit', {
      asset_a: 'ASSET', asset_b: 'XCP', quantity_a: amount.base, quantity_b: '1', min_lp_quantity: '0',
    }, { feeRate: 0.1 })).rejects.toThrow('fixture boundary reached')
    expect(new URL(urls[0]).searchParams.get('quantity_a')).toBe('100')
    expect(new URL(urls[0]).searchParams.get('sat_per_vbyte')).toBe('0.1')
  })
  it.each(['1e5', '-1', '0.1', '1,000', '9223372036854775808', 9007199254740992])('blocks raw quantity %s at the SDK boundary without requesting fees or composing', async (quantity) => {
    await expect(composeAndBroadcast(signer, 'order', {
      give_asset: 'ASSET', give_quantity: quantity,
      get_asset: 'XCP', get_quantity: '1', expiration: 5000, fee_required: 0,
    })).rejects.toThrow()
    expect(urls).toHaveLength(0)
    expect(signer.signTransaction).not.toHaveBeenCalled()
  })
  it.each([1.5, -1, NaN, Infinity])('blocks invalid expiration %s before network access', async (expiration) => {
    await expect(composeAndBroadcast(signer, 'order', {
      give_asset: 'ASSET', give_quantity: '1', get_asset: 'XCP', get_quantity: '1', expiration,
    })).rejects.toThrow()
    expect(urls).toHaveLength(0)
  })
  it.each([-1, NaN, Infinity])('blocks invalid fee rate %s before network access', async (feeRate) => {
    await expect(composeAndBroadcast(signer, 'pooldeposit', {
      asset_a: 'ASSET', asset_b: 'XCP', quantity_a: '100', quantity_b: '1', min_lp_quantity: '0',
    }, { feeRate })).rejects.toThrow()
    expect(urls).toHaveLength(0)
  })
})
