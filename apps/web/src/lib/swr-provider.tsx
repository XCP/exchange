'use client'

import { SWRConfig } from 'swr'
import { leaderPolling } from '@xcp/wallet-sdk/react'
import type { ReactNode } from 'react'

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateIfStale: true,
        dedupingInterval: 10_000,
        // One tab polls each key, the others take its broadcast. Several
        // tabs are how one visitor gets throttled.
        use: [leaderPolling],
      }}
    >
      {children}
    </SWRConfig>
  )
}
