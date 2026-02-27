import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Latest', 'Recent on-chain activity on the Counterparty DEX.', '/latest')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
