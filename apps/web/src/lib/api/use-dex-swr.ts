import useSWR, { type SWRConfiguration } from 'swr'
import { fetcher } from '@/lib/api/client'
import { useIndexerBlock } from '@/lib/hooks/useIndexerBlock'

export function useDexSWR<T>(url: string | null, options?: SWRConfiguration) {
  const block = useIndexerBlock()
  const keyUrl = url == null ? null
    : block != null ? `${url}${url.includes('?') ? '&' : '?'}_block=${block}`
    : url
  return useSWR<T>(keyUrl, fetcher, options)
}
