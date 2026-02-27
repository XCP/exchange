import type { Metadata } from 'next'
import { buildStaticMetadata } from '@/lib/metadata'
import BuyPage from './page.client'

interface Props {
  params: Promise<{ id: string }>
}

export function generateMetadata(): Metadata {
  return buildStaticMetadata('Buy Swap', 'Complete an atomic swap purchase on the Counterparty network.', '/swap/buy')
}

export default function Page({ params }: Props) {
  return <BuyPage params={params} />
}
