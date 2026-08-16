'use client'

import { useState } from 'react'
import { CTA } from '@/components/ui/form-kit'
import { FormNotice } from '@/components/ui/form-notice'
import { WalletInstallModal } from '@/components/wallet-install-modal'
import { useWallet } from '@/lib/wallet/wallet-context'

/**
 * The action at the foot of every form: connect, then do the thing.
 *
 * Standard web3 shape — a disconnected visitor sees one button, and after
 * connecting the same slot becomes the real action. The header button and
 * this one are the same connection (both read the shared wallet context), so
 * connecting from either lights up the other; this exists because the
 * *intent* differs. Someone clicking here means "I want to place this
 * trade", so the button says so rather than making them find the header.
 *
 * Previously each form re-implemented this and the four copies had already
 * drifted — different not-detected handling, different ellipsis, and none of
 * them surfaced connectError, so a failed connection looked like a dead
 * button.
 */
export function ConnectCTA({
  children,
  onClick,
  disabled,
  tone = 'primary',
}: {
  /** The label once connected. */
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'primary' | 'sell' | 'muted'
}) {
  const { status, connect, connecting, connectError } = useWallet()
  const [showInstall, setShowInstall] = useState(false)

  if (status === 'connected') {
    return (
      <CTA onClick={onClick} disabled={disabled} tone={tone}>
        {children}
      </CTA>
    )
  }

  return (
    <>
      {/* No margin of its own. These are returned in a fragment, so they land
          as direct children of the form's section and inherit its `space-y`
          like every other notice — an `mb-2` here stacked ON TOP of that and
          set this one message 16px off the button where all the others sit
          at 8px. */}
      {connectError && <FormNotice tone="error">{connectError}</FormNotice>}
      <CTA
        onClick={() => {
          // Re-check at click time rather than trusting the mount-time status:
          // an extension that injected late is common on a cold browser start,
          // and the wallet context listens for exactly that.
          if (typeof window !== 'undefined' && window.xcpwallet) connect()
          else setShowInstall(true)
        }}
        disabled={connecting}
        // Connecting stays available with an incomplete form, but it isn't
        // the step being asked for, so it takes the same muted treatment.
        tone={tone === 'muted' ? 'muted' : 'primary'}
      >
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </CTA>
      {showInstall && <WalletInstallModal onClose={() => setShowInstall(false)} />}
    </>
  )
}
