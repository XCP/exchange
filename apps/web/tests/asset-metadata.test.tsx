import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import { useAssetInfo } from '@/lib/hooks/useAssetInfo'

const fetcher = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/client', () => ({ fetcher, counterpartyUrl: (path: string) => path }))
afterEach(() => { cleanup(); fetcher.mockReset() })

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{children}</SWRConfig>
}

describe('metadata used to scale transaction amounts', () => {
  it('does not reuse divisibility while switching to an unresolved asset', async () => {
    fetcher.mockImplementation((url: string) => url.includes('/FIRST?')
      ? Promise.resolve({ result: { asset: 'FIRST', divisible: false } })
      : new Promise(() => {}))
    const { result, rerender } = renderHook(({ asset }) => useAssetInfo(asset), { initialProps: { asset: 'FIRST' }, wrapper })
    await waitFor(() => expect(result.current.info?.divisible).toBe(false))
    rerender({ asset: 'SECOND' })
    expect(result.current.info).toBeNull()
  })
  it.each([{ asset: 'WRONG', divisible: true }, { asset: 'ASSET' }, { asset: 'ASSET', divisible: 1 }])('rejects unverified asset metadata %o', async (metadata) => {
    fetcher.mockResolvedValue({ result: metadata })
    const { result } = renderHook(() => useAssetInfo('ASSET'), { wrapper })
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(result.current.info).toBeNull()
  })
  it('accepts the named subasset with an explicit divisibility flag', async () => {
    fetcher.mockResolvedValue({ result: { asset: 'A123456789123456789', asset_longname: 'PARENT.child', divisible: false } })
    const { result } = renderHook(() => useAssetInfo('PARENT.child'), { wrapper })
    await waitFor(() => expect(result.current.info?.divisible).toBe(false))
  })
})
