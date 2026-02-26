// Server-side PSBT construction for atomic swaps
//
// The server builds ALL PSBTs — clients only sign via wallet extension.
// This removes the need for @scure/btc-signer on the web app side.

import { Transaction, SigHash } from "@scure/btc-signer";
import { hex } from "@scure/base";

const MEMPOOL_API = "https://mempool.space/api";
const BLOCKSTREAM_API = "https://blockstream.info/api";

const PSBT_OPTS = {
  allowUnknownInputs: true,
  allowUnknownOutputs: true,
  allowLegacyWitnessUtxo: true,
  disableScriptCheck: true,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Utxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

interface FeeRecommendation {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

// ---------------------------------------------------------------------------
// Fee rate cache (30s)
// ---------------------------------------------------------------------------
let cachedFeeRate: number | null = null;
let feeRateTimestamp = 0;

export async function getFeeRate(): Promise<number> {
  const now = Date.now();
  if (cachedFeeRate && now - feeRateTimestamp < 30_000) return cachedFeeRate;
  try {
    const res = await fetch(`${MEMPOOL_API}/v1/fees/recommended`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: FeeRecommendation = await res.json();
    cachedFeeRate = Math.max(data.hourFee ?? 3, 1);
    feeRateTimestamp = now;
    return cachedFeeRate;
  } catch {
    return cachedFeeRate ?? 3;
  }
}

// ---------------------------------------------------------------------------
// UTXO fetching
// ---------------------------------------------------------------------------
export async function fetchAddressUtxos(address: string): Promise<Utxo[]> {
  // Primary: mempool.space
  try {
    const res = await fetch(`${MEMPOOL_API}/address/${address}/utxo`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return await res.json();
  } catch {
    // fallthrough to blockstream
  }

  // Fallback: blockstream.info
  const res = await fetch(`${BLOCKSTREAM_API}/address/${address}/utxo`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Failed to fetch UTXOs for ${address}`);
  return await res.json();
}

/** Fetch raw transaction hex for a given txid (needed for witnessUtxo / nonWitnessUtxo) */
async function fetchRawTx(txid: string): Promise<string> {
  try {
    const res = await fetch(`${MEMPOOL_API}/tx/${txid}/hex`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return (await res.text()).trim();
  } catch {
    // fallthrough
  }

  const res = await fetch(`${BLOCKSTREAM_API}/tx/${txid}/hex`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Failed to fetch raw tx ${txid}`);
  return (await res.text()).trim();
}

/** Fetch transaction details to get output script/value for witnessUtxo */
async function fetchTxInfo(txid: string): Promise<{
  vout: Array<{ scriptpubkey: string; value: number }>;
}> {
  try {
    const res = await fetch(`${MEMPOOL_API}/tx/${txid}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return await res.json();
  } catch {
    // fallthrough
  }

  const res = await fetch(`${BLOCKSTREAM_API}/tx/${txid}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Failed to fetch tx info ${txid}`);
  return await res.json();
}

// ---------------------------------------------------------------------------
// Seller PSBT construction
// ---------------------------------------------------------------------------
export async function constructSellerPsbt(params: {
  utxoTxid: string;
  utxoVout: number;
  utxoValue: number;
  sellerAddress: string;
  priceSats: number;
}): Promise<string> {
  const { utxoTxid, utxoVout, utxoValue, sellerAddress, priceSats } = params;

  // Fetch witness data for the seller's UTXO
  const txInfo = await fetchTxInfo(utxoTxid);
  const output = txInfo.vout[utxoVout];
  if (!output) {
    throw new Error(`Output ${utxoVout} not found in tx ${utxoTxid}`);
  }

  const tx = new Transaction(PSBT_OPTS);

  // Detect if seller address is legacy P2PKH (starts with 1 or m/n)
  const isLegacy = /^[1mn]/.test(sellerAddress);

  // Input 0: Seller's asset UTXO with SIGHASH_SINGLE|ANYONECANPAY
  const inputData: Parameters<typeof tx.addInput>[0] = {
    txid: utxoTxid,
    index: utxoVout,
    sighashType: SigHash.SINGLE_ANYONECANPAY, // 0x83
    witnessUtxo: {
      script: hex.decode(output.scriptpubkey),
      amount: BigInt(output.value),
    },
  };

  // Legacy P2PKH needs full previous tx for finalization
  if (isLegacy) {
    const rawTxHex = await fetchRawTx(utxoTxid);
    inputData.nonWitnessUtxo = hex.decode(rawTxHex);
  }

  tx.addInput(inputData);

  // Output 0: Payment to seller
  tx.addOutputAddress(sellerAddress, BigInt(priceSats));

  return hex.encode(tx.toPSBT());
}

// ---------------------------------------------------------------------------
// Buyer PSBT construction
// ---------------------------------------------------------------------------
export interface ListingForBuyer {
  psbt_hex: string;
  utxo_txid: string;
  utxo_vout: number;
  price_sats: number;
  seller_address: string;
}

// Platform fee: 2% with a 1000-sat floor
// Below 50k sats listing price, fee is 1000 sats flat; at/above 50k it's 2%
const PLATFORM_FEE_RATE = 0.02;
const MIN_FEE_SATS = 1000;

export function calculatePlatformFee(priceSats: number): number {
  return Math.max(Math.floor(priceSats * PLATFORM_FEE_RATE), MIN_FEE_SATS);
}

/** Pick a random fee address from a JSON array, or return the single address */
export function pickFeeAddress(feeAddressConfig: string): string {
  const trimmed = feeAddressConfig.trim();
  if (trimmed.startsWith('[')) {
    const addresses: string[] = JSON.parse(trimmed);
    return addresses[Math.floor(Math.random() * addresses.length)];
  }
  return trimmed;
}

export async function constructBuyerPsbt(params: {
  listing: ListingForBuyer;
  buyerAddress: string;
  feeRate: number;
  feeAddress?: string;
}): Promise<{ psbtHex: string; platformFeeSats: number }> {
  const { listing, buyerAddress, feeRate, feeAddress } = params;

  // Parse seller's PSBT to get witnessUtxo for input 0
  const sellerTx = Transaction.fromPSBT(hex.decode(listing.psbt_hex), PSBT_OPTS);
  const sellerInput = sellerTx.getInput(0);

  // Fetch buyer's UTXOs
  const allUtxos = await fetchAddressUtxos(buyerAddress);

  // Filter out dust UTXOs (likely Counterparty-attached)
  const spendableUtxos = allUtxos.filter((u) => u.value >= 1000);
  if (spendableUtxos.length === 0) {
    throw new Error("No spendable UTXOs found for buyer address");
  }

  // Platform fee output (2% if above floor, 0 otherwise)
  const platformFeeSats = feeAddress ? calculatePlatformFee(listing.price_sats) : 0;

  // Estimate tx size for fee calculation:
  // ~68 vB per input (P2WPKH), ~31 vB per output, ~10 vB overhead
  // Seller input + at least 1 buyer input + outputs (seller pay, buyer dust, change, optional fee)
  const DUST_AMOUNT = 546;
  const outputCount = platformFeeSats > 0 ? 4 : 3; // seller + dust + change + optional fee
  const BASE_VSIZE = 10 + 68 + 31 * outputCount; // seller input + outputs
  const PER_INPUT_VSIZE = 68;

  // Coin selection: accumulate until we cover price + fee
  const sortedUtxos = [...spendableUtxos].sort((a, b) => b.value - a.value);
  const selectedUtxos: Utxo[] = [];
  let totalInput = 0;
  let estimatedMinerFee = Math.ceil((BASE_VSIZE + PER_INPUT_VSIZE) * feeRate);

  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo);
    totalInput += utxo.value;

    // Recalculate miner fee with additional input
    estimatedMinerFee = Math.ceil(
      (BASE_VSIZE + PER_INPUT_VSIZE * selectedUtxos.length) * feeRate
    );

    const needed = listing.price_sats + DUST_AMOUNT + platformFeeSats + estimatedMinerFee;
    if (totalInput >= needed) break;
  }

  const totalNeeded = listing.price_sats + DUST_AMOUNT + platformFeeSats + estimatedMinerFee;
  if (totalInput < totalNeeded) {
    throw new Error(
      `Insufficient funds: have ${totalInput} sats, need ${totalNeeded} sats ` +
        `(price: ${listing.price_sats}, dust: ${DUST_AMOUNT}, platform fee: ${platformFeeSats}, miner fee: ${estimatedMinerFee})`
    );
  }

  // Fetch witnessUtxo for each buyer input
  const buyerTxInfos = new Map<string, Awaited<ReturnType<typeof fetchTxInfo>>>();
  for (const utxo of selectedUtxos) {
    if (!buyerTxInfos.has(utxo.txid)) {
      buyerTxInfos.set(utxo.txid, await fetchTxInfo(utxo.txid));
    }
  }

  // Build the PSBT
  const tx = new Transaction(PSBT_OPTS);

  // Input 0: Seller's UTXO (buyer does NOT sign this — seller's sig is merged later)
  tx.addInput({
    txid: listing.utxo_txid,
    index: listing.utxo_vout,
    sighashType:
      SigHash.SINGLE_ANYONECANPAY,
    ...(sellerInput.witnessUtxo ? { witnessUtxo: sellerInput.witnessUtxo } : {}),
    ...(sellerInput.nonWitnessUtxo
      ? { nonWitnessUtxo: sellerInput.nonWitnessUtxo }
      : {}),
  });

  // Input 1+: Buyer's funding UTXOs
  for (const utxo of selectedUtxos) {
    const txInfo = buyerTxInfos.get(utxo.txid)!;
    const output = txInfo.vout[utxo.vout];
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      sighashType: SigHash.ALL,
      witnessUtxo: {
        script: hex.decode(output.scriptpubkey),
        amount: BigInt(output.value),
      },
    });
  }

  // Output 0: Payment to seller
  tx.addOutputAddress(listing.seller_address, BigInt(listing.price_sats));

  // Output 1: Dust to buyer (asset destination)
  tx.addOutputAddress(buyerAddress, BigInt(DUST_AMOUNT));

  // Output 2 (optional): Platform fee
  if (platformFeeSats > 0 && feeAddress) {
    tx.addOutputAddress(feeAddress, BigInt(platformFeeSats));
  }

  // Output 2/3: Change to buyer (if any)
  const change = totalInput - listing.price_sats - DUST_AMOUNT - platformFeeSats - estimatedMinerFee;
  if (change >= DUST_AMOUNT) {
    tx.addOutputAddress(buyerAddress, BigInt(change));
  }

  return { psbtHex: hex.encode(tx.toPSBT()), platformFeeSats };
}
