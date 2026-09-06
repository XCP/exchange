'use client'

import { SWRConfig } from 'swr'
import { leaderPolling } from '@/lib/swr-leader'
import type { ReactNode } from 'react'

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateIfStale: true,
        dedupingInterval: 10_000,
        // One tab polls each key, the others take its broadcast — see
        // lib/swr-leader. Several tabs are how one visitor gets throttled.
        use: [leaderPolling],
      }}
    >
      {children}
    </SWRConfig>
  )
}
