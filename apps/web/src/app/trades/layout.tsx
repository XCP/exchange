import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Recent Trades', 'Completed order matches across all DEX markets.', '/trades')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
