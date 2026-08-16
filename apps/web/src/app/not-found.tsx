import Link from 'next/link'
import type { Metadata } from 'next'
import { NotFoundSearch } from '@/components/not-found-search'

export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: true },
}

/**
 * The 404, reached most often by a mistyped or retired asset name.
 *
 * A dead end is the wrong response to that: the visitor knows what they were
 * looking for and is one search away from it. So the page leads with a
 * search box rather than an apology, and offers the surfaces they were
 * probably heading to.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-600">404</p>
      <h1 className="mt-2 text-lg font-semibold text-zinc-100">Nothing here</h1>
      <p className="mt-1 text-sm text-zinc-500">
        That asset or page doesn&apos;t exist. Assets are case-sensitive for subassets — try
        searching instead.
      </p>

      <div className="mt-6">
        <NotFoundSearch />
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs">
        {[
          { label: 'Swap', href: '/swap' },
          { label: 'Limit', href: '/limit' },
          { label: 'Buy', href: '/buy' },
          { label: 'Orders', href: '/trade' },
          { label: 'Pools', href: '/pool' },
          { label: 'Dashboard', href: '/' },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
