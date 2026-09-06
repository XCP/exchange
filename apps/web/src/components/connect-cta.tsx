'use client'

import { CTA } from '@/components/ui/form-kit'
import { FormNotice } from '@/components/ui/form-notice'
import { useConnectFlow } from '@/lib/wallet/useConnectFlow'

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
  const wallet = useConnectFlow()

  if (wallet.connected) {
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
      {wallet.connectError && <FormNotice tone="error">{wallet.connectError}</FormNotice>}
      <CTA
        onClick={wallet.start}
        disabled={wallet.connecting}
        // Connecting stays available with an incomplete form, but it isn't
        // the step being asked for, so it takes the same muted treatment.
        tone={tone === 'muted' ? 'muted' : 'primary'}
      >
        {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
      </CTA>
      {wallet.walletModal}
    </>
  )
}
