// This is an explicit release hold, not generic Counterparty message verification.
// The backend also rejects new and pending fills; keeping the UI disabled alone
// would not protect direct callers or previously prepared PSBTs.
export const ATOMIC_PURCHASES_AVAILABLE = false
export const ATOMIC_DELIVERY_UNAVAILABLE =
  'Atomic purchases are temporarily unavailable while asset delivery is being corrected.'

export function assertAtomicPurchasesAvailable(): void {
  if (!ATOMIC_PURCHASES_AVAILABLE) throw new Error(ATOMIC_DELIVERY_UNAVAILABLE)
}
