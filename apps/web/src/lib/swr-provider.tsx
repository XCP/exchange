'use client'

import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateIfStale: true,
        dedupingInterval: 10_000,
      }}
    >
      {children}
    </SWRConfig>
  )
}
