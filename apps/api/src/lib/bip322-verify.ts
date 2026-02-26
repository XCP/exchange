// BIP-322 Simple signature verification
// Uses @noble/curves + @noble/hashes + @scure/btc-signer (all pure JS, Workers-compatible)
// Ported from the wallet extension's bip322.ts implementation

import { sha256 } from "@noble/hashes/sha256";
import { secp256k1, schnorr } from "@noble/curves/secp256k1";
import { hex, base64 } from "@scure/base";
import * as btc from "@scure/btc-signer";

const BIP322_TAG = "BIP0322-signed-message";

// --- Serialization helpers ---

function writeUint32LE(n: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = n & 0xff;
  bytes[1] = (n >> 8) & 0xff;
  bytes[2] = (n >> 16) & 0xff;
  bytes[3] = (n >> 24) & 0xff;
  return bytes;
}

function writeUint64LE(n: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((n >> BigInt(i * 8)) & 0xffn);
  }
  return bytes;
}

function writeCompactSize(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) {
    const bytes = new Uint8Array(3);
    bytes[0] = 0xfd;
    bytes[1] = n & 0xff;
    bytes[2] = (n >> 8) & 0xff;
    return bytes;
  }
  throw new Error("CompactSize too large");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// --- BIP-322 message hash (tagged hash) ---

function bip322MessageHash(message: string): Uint8Array {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const tagHash = sha256(encoder.encode(BIP322_TAG));
  return sha256(concat(tagHash, tagHash, messageBytes));
}

// --- Virtual transaction construction ---

function serializeToSpend(
  messageHash: Uint8Array,
  scriptPubKey: Uint8Array
): Uint8Array {
  // OP_0 PUSH32 messageHash
  const scriptSig = new Uint8Array(34);
  scriptSig[0] = 0x00; // OP_0
  scriptSig[1] = 0x20; // PUSH 32
  scriptSig.set(messageHash, 2);

  return concat(
    writeUint32LE(0), // version
    writeCompactSize(1), // input count
    new Uint8Array(32), // null txid
    new Uint8Array([0xff, 0xff, 0xff, 0xff]), // index 0xFFFFFFFF
    writeCompactSize(scriptSig.length),
    scriptSig,
    writeUint32LE(0), // sequence
    writeCompactSize(1), // output count
    writeUint64LE(0n), // amount = 0
    writeCompactSize(scriptPubKey.length),
    scriptPubKey,
    writeUint32LE(0) // locktime
  );
}

function computeToSpendTxid(
  messageHash: Uint8Array,
  scriptPubKey: Uint8Array
): string {
  const toSpend = serializeToSpend(messageHash, scriptPubKey);
  return hex.encode(sha256(sha256(toSpend)));
}

// --- Sighash computation ---

function calculateLegacySighash(
  toSpendTxId: string,
  scriptPubKey: Uint8Array
): Uint8Array {
  // Build the to_sign transaction with scriptPubKey in place
  const txidBytes = hex.decode(toSpendTxId);
  const reversedTxid = new Uint8Array(32);
  for (let i = 0; i < 32; i++) reversedTxid[i] = txidBytes[31 - i];

  const opReturn = new Uint8Array([0x6a]);
  const toSign = concat(
    writeUint32LE(0), // version
    writeCompactSize(1), // input count
    reversedTxid, // prevout txid
    writeUint32LE(0), // prevout index
    writeCompactSize(scriptPubKey.length),
    scriptPubKey, // scriptSig = scriptPubKey for signing
    writeUint32LE(0), // sequence
    writeCompactSize(1), // output count
    writeUint64LE(0n), // amount
    writeCompactSize(opReturn.length),
    opReturn,
    writeUint32LE(0), // locktime
    writeUint32LE(0x01) // SIGHASH_ALL
  );

  return sha256(sha256(toSign));
}

function calculateWitnessV0Sighash(
  toSpendTxId: string,
  scriptCode: Uint8Array
): Uint8Array {
  const txidBytes = hex.decode(toSpendTxId);
  const reversedTxid = new Uint8Array(32);
  for (let i = 0; i < 32; i++) reversedTxid[i] = txidBytes[31 - i];

  const prevout = concat(reversedTxid, writeUint32LE(0));
  const opReturn = new Uint8Array([0x6a]);
  const output = concat(
    writeUint64LE(0n),
    new Uint8Array([opReturn.length]),
    opReturn
  );

  return sha256(
    sha256(
      concat(
        writeUint32LE(0), // nVersion
        sha256(sha256(prevout)), // hashPrevouts
        sha256(sha256(writeUint32LE(0))), // hashSequence
        prevout, // outpoint
        writeCompactSize(scriptCode.length),
        scriptCode,
        writeUint64LE(0n), // amount
        writeUint32LE(0), // nSequence
        sha256(sha256(output)), // hashOutputs
        writeUint32LE(0), // nLockTime
        writeUint32LE(0x01) // SIGHASH_ALL
      )
    )
  );
}

// --- Witness stack parsing ---

function parseWitnessStack(data: Uint8Array): Uint8Array[] | null {
  if (data.length < 1) return null;
  const count = data[0];
  const items: Uint8Array[] = [];
  let offset = 1;
  for (let i = 0; i < count && offset < data.length; i++) {
    const len = data[offset++];
    if (offset + len > data.length) return null;
    items.push(data.slice(offset, offset + len));
    offset += len;
  }
  return items;
}

// --- DER signature parsing ---

function parseDERSignature(der: Uint8Array): Uint8Array | null {
  try {
    if (der[0] !== 0x30) return null;
    let offset = 2;
    if (der[offset] !== 0x02) return null;
    const rLen = der[offset + 1];
    const r = der.slice(offset + 2, offset + 2 + rLen);
    offset += 2 + rLen;
    if (der[offset] !== 0x02) return null;
    const sLen = der[offset + 1];
    const s = der.slice(offset + 2, offset + 2 + sLen);

    // Strip leading zeros, pad to 32 bytes
    const rBytes = r[0] === 0 ? r.slice(1) : r;
    const sBytes = s[0] === 0 ? s.slice(1) : s;
    const sig = new Uint8Array(64);
    sig.set(rBytes, 32 - rBytes.length);
    sig.set(sBytes, 64 - sBytes.length);
    return sig;
  } catch {
    return null;
  }
}

// --- Address type detection ---

function getAddressType(
  address: string
): "P2PKH" | "P2WPKH" | "P2SH" | "P2TR" | "unknown" {
  if (address.startsWith("1") || address.startsWith("m") || address.startsWith("n"))
    return "P2PKH";
  if (address.startsWith("3") || address.startsWith("2")) return "P2SH";
  if (address.startsWith("bc1q") || address.startsWith("tb1q")) return "P2WPKH";
  if (address.startsWith("bc1p") || address.startsWith("tb1p")) return "P2TR";
  return "unknown";
}

// --- Main verification function ---

/**
 * Verify a BIP-322 simple signature.
 * Supports P2WPKH, P2TR, P2PKH, and P2SH-P2WPKH addresses.
 * Pure JS, no Node.js dependencies — compatible with Cloudflare Workers.
 */
export async function verifyBip322Simple(
  address: string,
  message: string,
  signatureStr: string
): Promise<boolean> {
  try {
    const addressType = getAddressType(address);
    const messageHash = bip322MessageHash(message);

    // --- Taproot (P2TR) ---
    if (addressType === "P2TR") {
      if (!signatureStr.startsWith("tr:")) return false;
      const parts = signatureStr.slice(3).split(":");
      if (parts.length !== 2 || parts[0].length !== 128 || parts[1].length !== 64)
        return false;

      const sigBytes = hex.decode(parts[0]);
      const providedPubKey = hex.decode(parts[1]);

      if (!schnorr.verify(sigBytes, messageHash, providedPubKey)) return false;

      // Verify pubkey matches address
      const p2tr = btc.p2tr(providedPubKey);
      return p2tr.address === address;
    }

    // --- Witness-based address types (P2WPKH, P2SH-P2WPKH, P2PKH) ---
    let witnessData: Uint8Array;
    try {
      witnessData = base64.decode(signatureStr);
    } catch {
      return false;
    }

    const witnessStack = parseWitnessStack(witnessData);
    if (!witnessStack || witnessStack.length < 2) return false;

    const sigDER = witnessStack[0];
    const pubkey = witnessStack[1];

    // Derive address from pubkey and verify it matches
    let scriptPubKey: Uint8Array;
    let derivedAddress: string;

    if (addressType === "P2PKH") {
      const p2pkh = btc.p2pkh(pubkey);
      if (!p2pkh.script || !p2pkh.address) return false;
      scriptPubKey = p2pkh.script;
      derivedAddress = p2pkh.address;
    } else if (addressType === "P2WPKH") {
      const p2wpkh = btc.p2wpkh(pubkey);
      if (!p2wpkh.script || !p2wpkh.address) return false;
      scriptPubKey = p2wpkh.script;
      derivedAddress = p2wpkh.address;
    } else if (addressType === "P2SH") {
      const p2wpkh = btc.p2wpkh(pubkey);
      const p2sh = btc.p2sh(p2wpkh);
      if (!p2sh.script || !p2sh.address) return false;
      scriptPubKey = p2sh.script;
      derivedAddress = p2sh.address;
    } else {
      return false;
    }

    if (derivedAddress.toLowerCase() !== address.toLowerCase()) return false;

    // Strip sighash type byte from DER sig
    let sigBytes = sigDER;
    if (sigBytes.length > 0 && sigBytes[sigBytes.length - 1] === 0x01) {
      sigBytes = sigBytes.slice(0, -1);
    }

    const sig64 = parseDERSignature(sigBytes);
    if (!sig64) return false;

    // Compute sighash based on address type
    const toSpendTxId = computeToSpendTxid(messageHash, scriptPubKey);
    let sighash: Uint8Array;

    if (addressType === "P2PKH") {
      sighash = calculateLegacySighash(toSpendTxId, scriptPubKey);
    } else {
      // P2WPKH and P2SH-P2WPKH use BIP-143 witness v0 sighash
      const pubkeyHash = btc.p2wpkh(pubkey).hash;
      const scriptCode = btc.Script.encode([
        "DUP",
        "HASH160",
        pubkeyHash,
        "EQUALVERIFY",
        "CHECKSIG",
      ]);
      sighash = calculateWitnessV0Sighash(toSpendTxId, scriptCode);
    }

    return secp256k1.verify(sig64, sighash, pubkey);
  } catch {
    return false;
  }
}
