import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'
import { type SwapListing } from '@/lib/hooks/useSwapListings'

export function useSwapListing(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<SwapListing>(
    id ? dexUrl(`/swaps/${id}`) : null,
    fetcher,
    { refreshInterval: 15_000 }
  )

  return {
    listing: data ?? null,
    error,
    isLoading,
    mutate,
  }
}
