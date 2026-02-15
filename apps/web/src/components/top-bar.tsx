import Link from 'next/link'
import { SearchInput } from '@/components/search-input'

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-2">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-sm font-bold tracking-wider text-green-500 font-mono">
          XCP DEX
        </Link>
        <nav className="hidden sm:flex items-center gap-4">
          {[
            { label: 'Markets', href: '/' },
            { label: 'Orders', href: '/orders' },
            { label: 'Dispensers', href: '/dispensers' },
            { label: 'Trades', href: '/trades' },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-xs font-medium transition-colors hover:text-zinc-100 text-zinc-500"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <SearchInput />

      <div className="flex items-center gap-5">
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs text-zinc-500">BTC</span>
          <span className="text-xs text-zinc-300 font-mono">—</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Block</span>
          <span className="text-xs text-zinc-300 font-mono">—</span>
        </div>
        <div className="h-4 w-px bg-zinc-800" />
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-xs text-zinc-500">Synced</span>
        </div>
      </div>
    </header>
  )
}
