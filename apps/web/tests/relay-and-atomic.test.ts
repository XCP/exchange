// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Address, OutScript, Transaction } from '@scure/btc-signer'
import { hex } from '@scure/base'
import { GET } from '@/app/api/cp/[...path]/route'
import { verifySellerPsbt } from '@/utils/atomic-listing'

afterEach(() => vi.unstubAllGlobals())

describe('same-origin Counterparty relay', () => {
  it.each(['1e5', '1,000', '-1', '0.1', '9223372036854775808'])('rejects malformed compose and quote amounts %s without upstream access', async (quantity) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (const path of [['v2', 'addresses', 'source', 'compose', 'order'], ['v2', 'pools', 'A', 'B', 'quote']]) {
      const key = path.includes('compose') ? 'give_quantity' : 'quantity'
      const request = new Request(`https://app.invalid/api/cp?${new URLSearchParams({ [key]: quantity })}`)
      expect((await GET(request, { params: Promise.resolve({ path }) })).status).toBe(400)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('preserves exact raw digits, fractional fees, and a lossless response body', async () => {
    const body = '{"result":{"quantity":10000000000000001}}'
    const fetch = vi.fn().mockResolvedValue(new Response(body))
    vi.stubGlobal('fetch', fetch)
    const path = ['v2', 'addresses', 'source', 'compose', 'order']
    const response = await GET(new Request('https://app.invalid/api/cp?give_quantity=10000000000000001&sat_per_vbyte=1.56'), { params: Promise.resolve({ path }) })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
    expect(fetch.mock.calls[0][0]).toContain('give_quantity=10000000000000001&sat_per_vbyte=1.56')
  })
})

describe('custom atomic seller authorization', () => {
  const address = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT'
  const txid = 'a'.repeat(64)
  const intent = { address, txid, vout: 0, price: 1001n }
  const fixture = ({ price = 1001n, vout = 0, seller = address, extra = false, sighash = 0x83 } = {}) => {
    const tx = new Transaction({ allowLegacyWitnessUtxo: true })
    tx.addInput({ txid, index: vout, sighashType: sighash, witnessUtxo: { script: OutScript.encode(Address().decode(address)), amount: 546n } })
    tx.addOutputAddress(seller, price)
    if (extra) tx.addOutputAddress(address, 1n)
    return hex.encode(tx.toPSBT())
  }
  it('accepts the selected outpoint and exact seller payment', () => {
    expect(() => verifySellerPsbt(fixture(), intent)).not.toThrow()
  })
  it.each([{ price: 1000n }, { vout: 1 }, { seller: '1BitcoinEaterAddressDontSendf59kuE' }, { extra: true }, { sighash: 1 }])('blocks changed seller intent %o', (change) => {
    expect(() => verifySellerPsbt(fixture(change), intent)).toThrow()
  })
})
