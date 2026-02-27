import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Portfolio', 'View your open orders, dispensers, and asset balances.', '/portfolio')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
