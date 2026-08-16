'use client'

import { useState } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import { Dialog } from '@/components/ui/dialog'
import { XCP_IMG_BASE } from '@/utils/constants'
import type { AssetLinks } from '@/app/api/asset-links/route'

/**
 * The row under an asset's headline: share it, and go wherever it lives.
 *
 * Two different things sharing a row because they answer the same impulse —
 * "I want to do something with this asset that isn't trading it".
 */

/** Simple monochrome marks; each is one path so they inherit currentColor. */
const ICONS: Record<string, { label: string; path: string }> = {
  x: {
    label: 'X',
    path: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93ZM17.6 20.64h2.04L6.49 3.24H4.3Z',
  },
  telegram: {
    label: 'Telegram',
    path: 'M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Zm5.56 8.22-1.86 8.78c-.14.62-.51.77-1.03.48l-2.85-2.1-1.37 1.32c-.15.15-.28.28-.58.28l.21-2.93 5.33-4.82c.23-.2-.05-.32-.36-.12L8.47 13.3l-2.84-.89c-.62-.19-.63-.62.13-.92l11.1-4.28c.51-.19.96.12.7 1.01Z',
  },
  discord: {
    label: 'Discord',
    path: 'M20.32 4.57A19.79 19.79 0 0 0 15.43 3l-.24.45a14.6 14.6 0 0 1 4.34 2.2 20.4 20.4 0 0 0-15.06 0 14.6 14.6 0 0 1 4.34-2.2L8.57 3a19.79 19.79 0 0 0-4.89 1.57C.61 9.09-.22 13.5.19 17.84A19.9 19.9 0 0 0 6.25 21l.5-.7a13 13 0 0 1-2.13-1.02c.18-.13.35-.27.52-.4a14.2 14.2 0 0 0 12.12 0c.17.14.34.27.52.4-.68.4-1.4.74-2.13 1.02l.5.7a19.9 19.9 0 0 0 6.06-3.16c.48-5.03-.83-9.4-1.89-13.27ZM8.02 15.33c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4 2.17 1.08 2.15 2.4c0 1.32-.95 2.4-2.15 2.4Zm7.96 0c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4 2.17 1.08 2.15 2.4c0 1.32-.95 2.4-2.15 2.4Z',
  },
  github: {
    label: 'GitHub',
    path: 'M12 .3a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.6-4.04-1.6-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3Z',
  },
  instagram: {
    label: 'Instagram',
    path: 'M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 2.7.27.28 2.69.08 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98 1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z',
  },
  youtube: {
    label: 'YouTube',
    path: 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z',
  },
  facebook: {
    label: 'Facebook',
    path: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07Z',
  },
  reddit: {
    label: 'Reddit',
    path: 'M24 11.78a2.6 2.6 0 0 0-4.4-1.86 12.8 12.8 0 0 0-6.98-2.23l1.19-5.6 3.89.82a1.85 1.85 0 1 0 .2-1.2L13.5.78a.6.6 0 0 0-.71.46l-1.33 6.26a12.8 12.8 0 0 0-7.08 2.23A2.6 2.6 0 1 0 1.6 15.2a5.1 5.1 0 0 0-.06.8c0 4.06 4.7 7.35 10.5 7.35s10.5-3.29 10.5-7.35c0-.27-.02-.54-.06-.8A2.6 2.6 0 0 0 24 11.78ZM6.6 13.65a1.85 1.85 0 1 1 3.7 0 1.85 1.85 0 0 1-3.7 0Zm10.32 4.9c-1.27 1.27-3.7 1.36-4.42 1.36s-3.15-.1-4.42-1.36a.48.48 0 0 1 .68-.68c.8.8 2.52 1.09 3.74 1.09s2.93-.29 3.74-1.09a.48.48 0 1 1 .68.68Zm-.23-3.05a1.85 1.85 0 1 1 0-3.7 1.85 1.85 0 0 1 0 3.7Z',
  },
  medium: {
    label: 'Medium',
    path: 'M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12Zm7.42 0c0 3.54-1.51 6.41-3.38 6.41-1.87 0-3.39-2.87-3.39-6.41s1.52-6.41 3.39-6.41S20.96 8.46 20.96 12ZM24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12Z',
  },
  website: {
    label: 'Website',
    path: 'M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm7.94 7h-3.2a15.7 15.7 0 0 0-1.4-3.62A10.03 10.03 0 0 1 19.94 7ZM12 2.04c.83 1.2 1.48 2.53 1.91 4.96h-3.82c.43-2.43 1.08-3.76 1.91-4.96ZM2.26 14a9.9 9.9 0 0 1 0-4h3.66a20.6 20.6 0 0 0 0 4H2.26Zm.82 2h3.2c.35 1.28.82 2.5 1.4 3.62A10.03 10.03 0 0 1 3.08 16Zm3.2-9h-3.2a10.03 10.03 0 0 1 4.6-3.62A15.7 15.7 0 0 0 6.28 7ZM12 21.96c-.83-1.2-1.48-2.53-1.91-4.96h3.82c-.43 2.43-1.08 3.76-1.91 4.96ZM14.34 15H9.66a18.4 18.4 0 0 1 0-6h4.68a18.4 18.4 0 0 1 0 6Zm.32 4.62c.58-1.12 1.05-2.34 1.4-3.62h3.2a10.03 10.03 0 0 1-4.6 3.62ZM18.08 14a20.6 20.6 0 0 0 0-4h3.66a9.9 9.9 0 0 1 0 4h-3.66Z',
  },
}

const fetchLinks = (url: string) => fetch(url).then((r) => r.json() as Promise<AssetLinks>)

export function AssetLinksRow({
  asset,
  displayName,
  fact,
}: {
  asset: string
  displayName: string
  /** One line for the share card — a price, a supply, whatever is true. */
  fact?: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { data } = useSWR<AssetLinks>(`/api/asset-links?asset=${encodeURIComponent(asset)}`, fetchLinks, {
    revalidateOnFocus: false,
    // Chain descriptions are immutable in practice and the route caches for
    // an hour; re-asking on every mount would buy nothing.
    dedupingInterval: 3_600_000,
  })

  const url = typeof window !== 'undefined' ? `${window.location.origin}/${encodeURIComponent(displayName)}` : ''
  const links = [
    ...(data?.website ? [{ kind: 'website' as const, url: data.website }] : []),
    ...(data?.socials ?? []),
  ]

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {/* Only what the asset actually declared. No placeholder icons for
          links that do not exist — an empty row of greyed logos reads as a
          broken page rather than as an asset with no website. */}
      {links.map((l) => {
        const icon = ICONS[l.kind]
        if (!icon) return null
        return (
          <a
            key={l.kind}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={icon.label}
            aria-label={icon.label}
            className="flex size-[26px] items-center justify-center rounded-sm border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-3 fill-current">
              <path d={icon.path} />
            </svg>
          </a>
        )
      })}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-sm border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-3 fill-current">
          <path d="M18 16.08a2.9 2.9 0 0 0-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.5.47 1.17.77 1.91.77a2.8 2.8 0 1 0-2.8-2.8c0 .24.04.47.09.7L8.11 9.97A2.8 2.8 0 0 0 3.4 12a2.8 2.8 0 0 0 4.71 2.03l7.12 4.16c-.05.21-.08.43-.08.65a2.73 2.73 0 1 0 2.85-2.76Z" />
        </svg>
        Share
      </button>

      <Dialog open={open} onOpenChange={setOpen} title={`Share ${displayName}`}>
        <div className="px-1 pb-1">
          {/* What the link looks like when it unfurls, so the sharer can see
              what they are about to post rather than trusting it. */}
          <div className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-900/50 p-3">
            <Image
              src={`${XCP_IMG_BASE}/full/${asset}`}
              alt=""
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-sm object-contain"
              unoptimized
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-100">{displayName}</div>
              {fact && <div className="truncate text-xs text-zinc-400">{fact}</div>}
              <div className="mt-0.5 truncate text-[10px] text-zinc-600">
                xcpdex.com/{displayName}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(url).then(
                () => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                },
                () => {},
              )
            }}
            className="mt-3 w-full rounded-sm bg-green-500 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-950 transition-colors hover:bg-green-400"
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <a
            href={`https://x.com/intent/post?text=${encodeURIComponent(displayName)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-zinc-700 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-200 transition-colors hover:border-zinc-600"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-3 fill-current">
              <path d={ICONS.x.path} />
            </svg>
            Share on X
          </a>
        </div>
      </Dialog>
    </div>
  )
}
