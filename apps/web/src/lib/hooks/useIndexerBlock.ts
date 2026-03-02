import useSWR from 'swr'
import { fetcher, dexUrl } from '@/lib/api/client'

export function useIndexerBlock() {
  const { data } = useSWR<{ block: number | null }>(
    dexUrl('/block'),
    fetcher,
    { refreshInterval: 30_000, dedupingInterval: 15_000 }
  )
  return data?.block ?? null
}
