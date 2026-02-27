import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('List for Sale', 'Create a PSBT-based atomic swap listing on XCP DEX.', '/swap/sell')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
