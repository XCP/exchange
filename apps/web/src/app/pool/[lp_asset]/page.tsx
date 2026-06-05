import { permanentRedirect } from 'next/navigation'
import PoolDetailPage from './page.client'

interface Props {
  params: Promise<{ lp_asset: string }>
}

export default async function Page({ params }: Props) {
  // Canonicalize to uppercase slug (was handled by proxy.ts, unsupported on Cloudflare).
  const { lp_asset } = await params
  const upper = lp_asset.toUpperCase()
  if (lp_asset !== upper) permanentRedirect(`/pool/${upper}`)
  return <PoolDetailPage />
}
