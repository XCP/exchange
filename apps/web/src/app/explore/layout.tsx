import type { ReactNode } from 'react'
import { ExploreTabs } from '@/components/explore-tabs'

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <ExploreTabs />
      {children}
    </div>
  )
}
