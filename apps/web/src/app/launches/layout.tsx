import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata(
  'XCP-69 Launches',
  'Assets from completed XCP-69 launches — sold out, pool seeded, liquidity locked.',
  '/launches',
)

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
