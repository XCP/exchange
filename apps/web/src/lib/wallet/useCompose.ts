'use client'

import { useCompose as useSdkCompose } from '@xcp/wallet-sdk/react'
import { trackTx } from '@/lib/analytics'

const options = {
  // Every broadcast funnels through here, so no widget has to remember to report its conversion.
  onBroadcast: (txid: string, type: string) => trackTx(txid, type),
}

/** The SDK's compose → sign → broadcast pipeline, reporting each broadcast as a conversion. */
export function useCompose() {
  return useSdkCompose(options)
}
