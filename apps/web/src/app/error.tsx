'use client'

/**
 * What a visitor sees when a server render throws.
 *
 * Until this file existed the app had no boundary anywhere, so one failed
 * upstream read — a Counterparty throttle, a cancelled subrequest — replaced the
 * whole page with Next's built-in 500 and an error digest. The digest is a hash
 * of the stack, deliberately meaningless to the reader and, because Next prints
 * it to the browser rather than logging it, unsearchable in Workers Logs too.
 *
 * The asset page is the one that matters: it makes six server-side reads
 * against a key space of 248k assets, so a single upstream wobble used to take
 * the page down entirely. Retrying usually works, because these failures are
 * transient by nature.
 */

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Next logs the server half itself; this covers the client half, where
  // nothing else would record it.
  useEffect(() => {
    console.error('render failed', error.digest ?? '', error.message)
  }, [error])

  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 py-24">
      <h1 className="text-2xl font-semibold">This page didn&rsquo;t load</h1>
      <p className="text-sm text-zinc-400">
        Something upstream failed while building it. Trying again usually works.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Try again
        </button>
        <Link href="/" className="rounded border border-zinc-700 px-4 py-2 text-sm font-medium">
          Go home
        </Link>
      </div>
    </main>
  )
}
