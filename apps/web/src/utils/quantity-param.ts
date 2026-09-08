import { serializeRawInteger } from '@xcp/wallet-sdk/amounts'

/** Raw quantities only. Text and fractional fields use their own SDK serializers. */
export const quantityParam = serializeRawInteger
