import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'

export const metadata: Metadata = buildStaticMetadata('Atomic Swaps', 'Trustless peer-to-peer asset swaps on Bitcoin via PSBTs.', '/swap')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
