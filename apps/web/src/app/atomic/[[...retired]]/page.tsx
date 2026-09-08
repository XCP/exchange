import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Atomic trading retired | XCP DEX',
  description: 'Exchange atomic PSBT trading has been retired. Use DigiRare Marketplace for PSBT trading.',
  robots: { index: false, follow: true },
}

/** Keep old shared URLs useful without retaining a signing or listing surface. */
export default function RetiredAtomicPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-12 text-sm text-zinc-300">
      <h1 className="text-xl font-semibold text-zinc-100">Atomic trading has been retired</h1>
      <p>Exchange no longer offers atomic PSBT trading. Use DigiRare Marketplace for PSBT trading.</p>
      <div className="flex gap-4">
        <a className="text-blue-400 underline" href="https://digirare.com/">Open Marketplace</a>
        <Link className="text-zinc-400 underline" href="/swap">Back to Exchange</Link>
      </div>
    </main>
  )
}
