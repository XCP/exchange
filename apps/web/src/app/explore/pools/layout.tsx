import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Counterparty Liquidity Pools', 'AMM liquidity pools indexed from Counterparty events.', '/explore/pools')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
