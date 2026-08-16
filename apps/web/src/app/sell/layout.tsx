import type { ReactNode } from 'react'
import { TradeTabs } from '@/components/trade-tabs'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <TradeTabs />
      {children}
    </div>
  )
}
