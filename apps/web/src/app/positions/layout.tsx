import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata(
  'Liquidity positions',
  undefined,
  '/positions',
)

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
