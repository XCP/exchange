'use client'

import type { ReactNode } from 'react'

/**
 * Every message a trading form shows, in one shape.
 *
 * This existed seven times as copy-pasted markup across swap, limit and the
 * two dispense forms, and the copies had already drifted: blocking problems
 * were rendered as amber boxes while advisory ones got the identical box, and
 * the genuinely fatal messages ("not enough balance") were bare unboxed text.
 * A warning therefore carried more visual weight than an error.
 *
 * The tone is decided by ONE question — can you still submit?
 *
 *  - `error`   you cannot submit until this changes. Red, boxed.
 *  - `warn`    you can submit, but the outcome is not what you'd assume.
 *  - `success` it is done.
 *
 * That rule is deliberately mechanical. "How bad is this?" invites a
 * judgement call per message and is what let the copies drift; "does the
 * button work?" has exactly one answer per condition and can be checked
 * against the `ready` expression sitting a few lines away.
 */
export type NoticeTone = 'error' | 'warn' | 'success'

const TONES: Record<NoticeTone, string> = {
  error: 'border-red-500/30 bg-red-500/10 text-red-400',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  success: 'border-green-500/30 bg-green-500/10 text-green-400',
}

export function FormNotice({
  tone = 'warn',
  children,
}: {
  tone?: NoticeTone
  children: ReactNode
}) {
  return (
    <p className={`rounded-lg border px-2.5 py-2 text-xs leading-snug ${TONES[tone]}`}>{children}</p>
  )
}

/**
 * What every form says when it worked.
 *
 * One component because the wording is a promise about what happened —
 * broadcast, not confirmed — and four hand-maintained copies of that
 * sentence is four chances to overstate it on one page and not the others.
 */
export function TxBroadcast({ txid, onReset }: { txid: string; onReset: () => void }) {
  return (
    <FormNotice tone="success">
      Broadcast —{' '}
      <a
        href={`https://xcp.io/tx/${txid}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        view transaction
      </a>
      <button onClick={onReset} className="ml-2 underline opacity-70 transition-opacity hover:opacity-100">
        Reset
      </button>
    </FormNotice>
  )
}
