import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata(
  'Mempool',
  'Counterparty transactions broadcast but not yet confirmed — orders, dispenses, sends and issuances currently in flight.',
  '/mempool',
)

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
