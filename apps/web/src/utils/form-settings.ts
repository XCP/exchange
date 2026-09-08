/** App limits are deliberately no broader than the field Core serializes. */
export const validFeeRate = (value: number) => Number.isFinite(value) && value >= 0 && value <= 10_000
export const validSlippage = (value: number) => Number.isFinite(value) && value >= 0.01 && value <= 50
// 8064 works before and after Core's indefinite_orders activation.
export const validExpiration = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 8064
