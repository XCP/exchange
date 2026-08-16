import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Counterparty DEX Orders', 'DEX orders across all Counterparty markets.', '/explore/orders')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
