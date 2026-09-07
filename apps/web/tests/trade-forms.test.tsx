import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { DisplayPreferencesProvider } from '@/lib/display-preferences'
import { writeRaw } from '@/lib/preferences'
import SettingsPage from '@/app/settings/page'
import { LimitWidget } from '@/components/limit-widget'
import { SwapWidget } from '@/components/swap-widget'
import { PoolManagePanel } from '@/components/pool/pool-manage-panel'
import { TradeForm } from '@/components/trade-form'
import { DispenseWidget } from '@/components/dispense-widget'
import { PortfolioUtxos } from '@/components/portfolio/portfolio-utxos'
import type { Dispenser } from '@/types/trading'
import type { PoolSummary, PoolAddressPosition } from '@/lib/hooks/usePools'

const mocks = vi.hoisted(() => ({
  compose: vi.fn(), fetcher: vi.fn(), divisible: true as boolean | undefined,
  balance: '1000000000', output: '100', quoteFailure: false,
}));
vi.mock('@/lib/wallet/useCompose', () => ({ useCompose: () => ({ status: 'idle', composeOrder: mocks.compose, composePoolDeposit: mocks.compose, composePoolWithdraw: mocks.compose, composeDispense: mocks.compose, composeDispenser: mocks.compose, composeAttach: mocks.compose, reset: vi.fn() }) }))
vi.mock('@/lib/wallet/wallet-context', () => ({ useWallet: () => ({ address: 'wallet', status: 'connected' }) }))
vi.mock('@/lib/wallet/useConnectFlow', () => ({ useConnectFlow: () => ({ start: vi.fn(), connecting: false }) }))
vi.mock('@/components/connect-cta', () => ({ ConnectCTA: (props: ComponentProps<'button'>) => <button {...props} /> }))
vi.mock('@/components/asset-select', () => ({ AssetSelect: () => null }))
vi.mock('@/components/order-book-ladder', () => ({ OrderBookLadder: () => null }))
vi.mock('@/lib/hooks/useAssetInfo', () => ({ useAssetInfo: (asset: string) => ({ info: asset ? { divisible: asset === 'XCP' ? true : mocks.divisible } : null }) }))
vi.mock('@/lib/hooks/useBalance', () => ({ useBalance: () => ({ balance: Number(mocks.balance), balanceNormalized: mocks.balance }) }))
vi.mock('@/lib/hooks/usePairStats', () => ({ usePairStats: () => ({}) }))
vi.mock('@/lib/hooks/useOrderBook', () => ({ useOrderBook: () => ({ bids: [], asks: [] }) }))
vi.mock('@/lib/hooks/useNetworkInfo', () => ({ useXcpPrice: () => ({ xcpUsd: null }), useBtcPrice: () => null, useFeeRate: () => 1.56 }))
vi.mock('@/lib/hooks/useMempool', () => ({ useMempool: () => ({ entries: [] }), useMempoolDispenses: () => new Set() }))
vi.mock('@/lib/hooks/useBtcBalance', () => ({ useBtcBalance: () => ({ sats: 100000000 }) }))
vi.mock('@/lib/hooks/useAssetDispensers', () => ({ useAddressDispensers: () => ({ dispensers: [] }) }))
vi.mock('@/lib/hooks/useUtxoBalances', () => ({ useUtxoBalances: () => ({ balances: [], isLoading: false, mutate: vi.fn() }) }))
vi.mock('@/lib/sats-context', () => ({ useSatsMode: () => ({ satsMode: false }) }))
vi.mock('@/lib/api/client', () => ({
  fetcher: mocks.fetcher,
  counterpartyUrl: (path: string) => `https://fixture.invalid${path}`,
  dexUrl: (path: string) => `https://fixture.invalid/dex${path}`,
}))
vi.mock('@/lib/hooks/usePools', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/hooks/usePools')>(),
  usePoolByPair: () => ({ pool: null, isLoading: false }),
}))

function mount(children: ReactNode) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>)
}
beforeEach(() => {
  mocks.compose.mockReset()
  mocks.divisible = true
  mocks.balance = '1000000000'
  mocks.output = '100'
  mocks.quoteFailure = false
  mocks.fetcher.mockReset().mockImplementation(async (url: string) => {
    if (mocks.quoteFailure) throw new Error('offline')
    if (url.includes('/quote/deposit')) return { result: { first_deposit: true, asset_a: 'ASSET', asset_b: 'XCP', quantity_a_required: null, quantity_b_required: null, quantity_minted_estimate: null } }
    return { result: { estimated_output: mocks.output, pool_output: mocks.output, book_output: 0, give_remaining: 0, price_impact: 0, fee_bps: 30 } }
  })
})
afterEach(cleanup)

const limitProps = { asset: 'ASSET', assetLabel: 'ASSET', quoteAsset: 'XCP', quoteLabel: 'XCP', onAssetChange: vi.fn(), onQuoteChange: vi.fn(), side: 'sell' as const, expiration: 5000 }
const swapProps = { giveAsset: 'XCP', getAsset: 'ASSET', giveLabel: 'XCP', getLabel: 'ASSET', onSelect: vi.fn(), onFlip: vi.fn(), slippage: 1, slippageAuto: false, onAutoSlippage: vi.fn(), feeRate: 1.56, expiration: 5000 }

describe('production trading forms', () => {
  it('keeps complete input drafts and serialized amounts canonical when display preferences change', async () => {
    writeRaw('numberLocale', null)
    writeRaw('fiatCurrency', null)
    mount(<DisplayPreferencesProvider><SettingsPage /><LimitWidget {...limitProps} seedPrice="1" /></DisplayPreferencesProvider>)
    const amount = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement
    await userEvent.type(amount, '0,5')
    await userEvent.selectOptions(screen.getByLabelText('Number format'), 'fr-FR')
    expect(amount.value).toBe('0,5')
    expect((screen.getByRole('button', { name: /sell/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.compose).not.toHaveBeenCalled()
    await userEvent.clear(amount)
    await userEvent.type(amount, '100000000.00000001')
    await userEvent.selectOptions(screen.getByLabelText('Number format'), 'ja-JP')
    expect(amount.value).toBe('100000000.00000001')
    await userEvent.click(screen.getByRole('button', { name: /sell/i }))
    expect(mocks.compose).toHaveBeenCalledWith(expect.objectContaining({ give_quantity: '10000000000000001', get_quantity: '10000000000000001' }))
  })
  it('refuses invalid sequential and seeded amounts in Limit, then sends exact large digits', async () => {
    mount(<LimitWidget {...limitProps} seedPrice="1" seedAmount="1e5" />)
    const amount = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement
    expect(amount.value).toBe('1e5')
    const submit = screen.getByRole('button', { name: /sell/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.clear(amount)
    await userEvent.type(amount, '-5')
    await userEvent.click(submit)
    expect(mocks.compose).not.toHaveBeenCalled()
    await userEvent.clear(amount)
    await userEvent.type(amount, '100000000.00000001')
    await userEvent.click(submit)
    expect(mocks.compose).toHaveBeenCalledWith(expect.objectContaining({ give_quantity: '10000000000000001', get_quantity: '10000000000000001' }))
  })
  it('preserves indivisible hundreds in a percentage preset and refuses fractional drafts', async () => {
    mocks.divisible = false
    mocks.balance = '400'
    mount(<LimitWidget {...limitProps} seedPrice="1" />)
    await userEvent.click(screen.getByRole('button', { name: '25%' }))
    expect((screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe('100')
    await userEvent.clear(screen.getByRole('textbox', { name: 'Amount' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount' }), '0.5')
    expect((screen.getByRole('button', { name: /sell/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.compose).not.toHaveBeenCalled()
  })
  it('does not quote malformed Swap drafts and sends exact raw digits after correction', async () => {
    mount(<SwapWidget {...swapProps} />)
    const amount = screen.getByRole('textbox')
    await userEvent.type(amount, '1e5')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(mocks.fetcher).not.toHaveBeenCalled()
    expect(mocks.compose).not.toHaveBeenCalled()
    await userEvent.clear(amount)
    await userEvent.type(amount, '100000000.00000001')
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining('quantity=10000000000000001')))
    const submit = await screen.findByRole('button', { name: /swap/i }) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(false))
    await userEvent.click(submit)
    await waitFor(() => expect(mocks.compose).toHaveBeenCalledWith(expect.objectContaining({ give_quantity: '10000000000000001', get_quantity: '99', fee_rate: 1.56 })))
  })
  it('blocks Swap when the last-moment quote cannot be confirmed', async () => {
    mount(<SwapWidget {...swapProps} />)
    await userEvent.type(screen.getByRole('textbox'), '1')
    const submit = await screen.findByRole('button', { name: /swap/i }) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(false))
    mocks.quoteFailure = true
    await userEvent.click(submit)
    await screen.findByText(/could not be reconfirmed/)
    expect(mocks.compose).not.toHaveBeenCalled()
  })
  it('abandons a pending Swap recheck when the user changes the draft', async () => {
    mount(<SwapWidget {...swapProps} />)
    await userEvent.type(screen.getByRole('textbox'), '1')
    const submit = await screen.findByRole('button', { name: /swap/i }) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(false))
    let resolve: (result: unknown) => void = () => {}
    mocks.fetcher.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    await userEvent.click(submit)
    await userEvent.type(screen.getByRole('textbox'), 'e5')
    await act(async () => { resolve({ result: { estimated_output: '100', pool_output: '100', book_output: 0, give_remaining: 0, price_impact: 0 } }) })
    expect(mocks.compose).not.toHaveBeenCalled()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('1e5')
  })
  it('flips an indivisible quote of 100 into a draft of 100', async () => {
    mocks.divisible = false
    mount(<SwapWidget {...swapProps} />)
    await userEvent.type(screen.getByRole('textbox'), '1')
    await screen.findByRole('button', { name: /swap/i })
    await userEvent.click(screen.getByRole('button', { name: 'Flip direction' }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('100')
  })
  it('quotes and composes pool deposits without crossing a double or removing punctuation', async () => {
    mount(<PoolManagePanel pool={null} position={null} walletStatus="connected" address="wallet" slippagePercent={1} feeRate={1.56} legA="ASSET" legB="XCP" />)
    const first = screen.getAllByRole('textbox')[0]
    await userEvent.type(first, '0,5')
    expect(mocks.fetcher).not.toHaveBeenCalled()
    await userEvent.clear(first)
    await userEvent.type(first, '100000000.00000001')
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining('quantity=10000000000000001')))
    await waitFor(() => expect(screen.getAllByRole('textbox').length).toBe(2))
    await userEvent.type(screen.getAllByRole('textbox')[1], '0.00000001')
    const submit = screen.getByRole('button', { name: 'Create pool & deposit' }) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(false))
    await userEvent.click(submit)
    await waitFor(() => expect(mocks.compose).toHaveBeenCalledWith(expect.objectContaining({ quantity_a: '10000000000000001', quantity_b: '1', min_lp_quantity: '0', fee_rate: 1.56 })))
  })
  it('the legacy TradeForm submit path no longer round-trips through Number', async () => {
    function Legacy() {
      const [amount, setAmount] = useState('100000000.00000001')
      const [price, setPrice] = useState('1')
      return <TradeForm baseSymbol="ASSET" quoteSymbol="XCP" baseDivisible quoteDivisible tradeTab="sell" setTradeTab={vi.fn()} amountInput={amount} setAmountInput={setAmount} priceInput={price} setPriceInput={setPrice} />
    }
    mount(<Legacy />)
    const submit = screen.getAllByRole('button', { name: /sell/i }).at(-1)!
    await userEvent.click(submit)
    expect(mocks.compose).toHaveBeenCalledWith(expect.objectContaining({ give_quantity: '10000000000000001', get_quantity: '10000000000000001' }))
  })
  it('withdraws exact LP raw units and maps each mixed-divisibility minimum by asset name', async () => {
    mocks.divisible = false
    const pool = { lp_asset: 'A123456789123456789', asset_a: 'ASSET', asset_b: 'XCP' } as PoolSummary
    const position = { pool, address: 'wallet', balance: { balance_raw: '10000000000000001', balance: 100000000 } } as unknown as PoolAddressPosition
    mocks.fetcher.mockResolvedValue({ result: { pool_exists: true, asset_a: 'ASSET', asset_b: 'XCP', quantity_a_estimate: '100', quantity_b_estimate: '200000000' } })
    mount(<PoolManagePanel pool={pool} position={position} walletStatus="connected" address="wallet" slippagePercent={1} feeRate={1.56} legA="XCP" legB="ASSET" tab="withdraw" />)
    await userEvent.click(screen.getByRole('button', { name: 'Max' }))
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining('quantity=10000000000000001')))
    await screen.findByText(/1\.98 XCP \+ 99 ASSET/)
    const submit = screen.getByRole('button', { name: 'Withdraw liquidity' }) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(false))
    await userEvent.click(submit)
    await waitFor(() => expect(mocks.compose).toHaveBeenCalledWith({ lp_asset: pool.lp_asset, quantity: '10000000000000001', min_quantity_a: '99', min_quantity_b: '198000000', fee_rate: 1.56 }))
  })
  it('requires correcting fractional indivisible dispenser purchases before paying BTC', async () => {
    mocks.divisible = false
    const dispenser = { asset: 'ASSET', source: 'seller', tx_hash: 'hash', give_quantity: 1, give_remaining: 1000, give_quantity_normalized: '1', satoshirate: 1000 } as unknown as Dispenser
    mount(<DispenseWidget asset="ASSET" assetLabel="ASSET" dispensers={[dispenser]} dispensersLoading={false} showLadder={false} pinnedAddress={null} mode="buy" feeRate={1.56} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '1.5')
    const submit = screen.getByRole('button', { name: 'Buy ASSET' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.clear(input)
    await userEvent.type(input, '100')
    await userEvent.click(submit)
    expect(mocks.compose).toHaveBeenCalledWith({ dispenser: 'seller', quantity: '100000', fee_rate: 1.56 })
  })
  it('retains a malformed Attach draft and sends an exact corrected quantity', async () => {
    mount(<PortfolioUtxos address="wallet" />)
    await userEvent.click(screen.getByRole('button', { name: /attach/i }))
    await userEvent.type(screen.getByPlaceholderText('e.g. PEPECASH'), 'ASSET')
    const input = screen.getByRole('textbox', { name: 'Quantity to attach' })
    await userEvent.type(input, '-5')
    const submit = screen.getByRole('button', { name: 'Attach' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.clear(input)
    await userEvent.type(input, '100000000.00000001')
    await userEvent.click(submit)
    expect(mocks.compose).toHaveBeenCalledWith({ asset: 'ASSET', quantity: '10000000000000001' })
  })
})
