import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata(
  'Best Deals',
  'Counterparty assets listed below fair value. Discover underpriced collectibles on the XCP DEX.',
  '/deals',
)

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
