import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Orders', 'DEX orders across all Counterparty markets.', '/trade')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
