import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Dispensers', 'Browse active dispensers on the Counterparty network.', '/dispense')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
