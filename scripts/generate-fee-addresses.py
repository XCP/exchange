#!/usr/bin/env python3
"""
Generate 200 taproot (P2TR) addresses from a BIP-39 mnemonic.
Derivation path: m/86'/0'/0'/0/i for i in 0..199

Usage:
    pip install bip-utils
    python generate-fee-addresses.py

Outputs a JSON array to scripts/fee-addresses.json
"""

import json
import getpass
from pathlib import Path

try:
    from bip_utils import (
        Bip39SeedGenerator,
        Bip86,
        Bip86Coins,
        Bip44Changes,
    )
except ImportError:
    print("Missing dependency. Install with:")
    print("  pip install bip-utils")
    raise SystemExit(1)

NUM_ADDRESSES = 200
OUTPUT_PATH = Path(__file__).parent / "fee-addresses.json"


def main():
    mnemonic = getpass.getpass("Enter mnemonic (hidden): ").strip()
    if not mnemonic:
        print("No mnemonic provided.")
        raise SystemExit(1)

    seed = Bip39SeedGenerator(mnemonic).Generate()

    # BIP-86 = taproot: m/86'/0'/0'
    bip86_ctx = Bip86.FromSeed(seed, Bip86Coins.BITCOIN)
    account = bip86_ctx.Purpose().Coin().Account(0)
    change = account.Change(Bip44Changes.CHAIN_EXT)  # external (receiving)

    addresses = []
    for i in range(NUM_ADDRESSES):
        addr = change.AddressIndex(i).PublicKey().ToAddress()
        addresses.append(addr)
        print(f"  {i:3d}: {addr}")

    OUTPUT_PATH.write_text(json.dumps(addresses, indent=2) + "\n")
    print(f"\nWrote {NUM_ADDRESSES} taproot addresses to {OUTPUT_PATH}")
    print(f"Set FEE_ADDRESS in your Worker env to the contents of that file.")


if __name__ == "__main__":
    main()
