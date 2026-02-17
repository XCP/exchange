// PSBT merge + broadcast utilities for atomic swaps
//
// Flow:
//   1. Seller creates PSBT: input 0 = their UTXO, output 0 = payment to them
//      Signs input 0 with SIGHASH_SINGLE|ANYONECANPAY (0x83)
//   2. Buyer creates complete PSBT from scratch:
//      Input 0 = seller's UTXO (from listing, unsigned by buyer)
//      Input 1+ = buyer's funding UTXOs (signed by buyer with SIGHASH_ALL)
//      Output 0 = payment to seller (must match seller's expectation)
//      Output 1 = dust to buyer (receives the asset)
//      Output 2 = change to buyer
//   3. Server copies seller's signature for input 0 into buyer's PSBT
//   4. Finalize and broadcast

import { Transaction } from "@scure/btc-signer";
import { hex } from "@scure/base";

const PSBT_OPTS = {
  allowUnknownInputs: true,
  allowUnknownOutputs: true,
  allowLegacyWitnessUtxo: true,
  disableScriptCheck: true,
} as const;

/**
 * Verify that input 0 in both PSBTs references the same UTXO.
 */
function assertSameUtxo(
  sellerTx: Transaction,
  buyerTx: Transaction,
  expectedTxid: string,
  expectedVout: number
): void {
  for (const [label, tx] of [
    ["seller", sellerTx],
    ["buyer", buyerTx],
  ] as const) {
    if (tx.inputsLength === 0) {
      throw new Error(`${label} PSBT has no inputs`);
    }
    const inp = tx.getInput(0);
    const txid = inp.txid ? hex.encode(inp.txid) : "";
    if (txid !== expectedTxid || inp.index !== expectedVout) {
      throw new Error(
        `${label} PSBT input 0 (${txid}:${inp.index}) does not match listing UTXO (${expectedTxid}:${expectedVout})`
      );
    }
  }
}

/**
 * Merge seller's signature into buyer's PSBT, finalize, and return raw tx hex.
 *
 * @param sellerPsbtHex  Seller's signed PSBT (hex) — 1 input + 1 output
 * @param buyerPsbtHex   Buyer's signed PSBT (hex) — complete tx, buyer's inputs signed
 * @param expectedTxid   The listing's utxo_txid (for validation)
 * @param expectedVout   The listing's utxo_vout (for validation)
 * @returns Raw transaction hex ready for broadcast
 */
export function mergeAndFinalize(
  sellerPsbtHex: string,
  buyerPsbtHex: string,
  expectedTxid: string,
  expectedVout: number
): string {
  const sellerTx = Transaction.fromPSBT(hex.decode(sellerPsbtHex), PSBT_OPTS);
  const buyerTx = Transaction.fromPSBT(hex.decode(buyerPsbtHex), PSBT_OPTS);

  // Validate both reference the correct UTXO
  assertSameUtxo(sellerTx, buyerTx, expectedTxid, expectedVout);

  const sellerInput = sellerTx.getInput(0);

  // Build update payload — copy all signature-related data from seller's input 0
  const update: Record<string, unknown> = {};

  if (sellerInput.partialSig && sellerInput.partialSig.length > 0) {
    update.partialSig = sellerInput.partialSig;
  }
  // Taproot path
  if (sellerInput.tapKeySig) {
    update.tapKeySig = sellerInput.tapKeySig;
  }
  if (sellerInput.tapScriptSig && sellerInput.tapScriptSig.length > 0) {
    update.tapScriptSig = sellerInput.tapScriptSig;
  }

  // Also copy UTXO witness data if the buyer's PSBT is missing it
  if (sellerInput.witnessUtxo) update.witnessUtxo = sellerInput.witnessUtxo;
  if (sellerInput.nonWitnessUtxo) update.nonWitnessUtxo = sellerInput.nonWitnessUtxo;
  if (sellerInput.redeemScript) update.redeemScript = sellerInput.redeemScript;
  if (sellerInput.witnessScript) update.witnessScript = sellerInput.witnessScript;
  if (sellerInput.sighashType !== undefined) update.sighashType = sellerInput.sighashType;

  if (!update.partialSig && !update.tapKeySig && !update.tapScriptSig) {
    throw new Error("Seller PSBT input 0 has no signature data");
  }

  // Copy seller's signature into buyer's transaction input 0
  // The third arg (true) ignores the sign-status check
  buyerTx.updateInput(0, update, true);

  // Finalize all inputs and extract raw transaction
  buyerTx.finalize();
  return buyerTx.hex;
}

/**
 * Broadcast a raw transaction via mempool.space API.
 * Returns the txid on success.
 */
export async function broadcastTx(rawTxHex: string): Promise<string> {
  const res = await fetch("https://mempool.space/api/tx", {
    method: "POST",
    body: rawTxHex,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Broadcast failed (${res.status}): ${body}`);
  }

  // mempool.space returns the txid as plain text
  return (await res.text()).trim();
}
