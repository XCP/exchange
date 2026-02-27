import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Markets', 'Active markets on the Counterparty DEX with open orders.', '/markets')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
