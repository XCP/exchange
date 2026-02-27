import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Analytics', 'Trade volume, top pairs, and market statistics for the Counterparty DEX.', '/analytics')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
