import useSWR from 'swr'
import { dexUrl, fetcher } from '@/lib/api/client'

interface Tag {
  slug: string
  name: string
  tag_type: string
  assets_count: number
  open_orders_count: number
  open_dispensers_count: number
}

export function useTags(type = 'collection') {
  const { data } = useSWR<{ tags: Tag[] }>(
    dexUrl(`/tags?type=${type}`),
    fetcher,
    { revalidateOnFocus: false }
  )
  return data?.tags ?? []
}
