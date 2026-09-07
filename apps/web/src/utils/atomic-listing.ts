import { Address, OutScript, Transaction } from '@scure/btc-signer'
import { hex } from '@scure/base'
import { scureNetwork } from '@xcp/wallet-sdk'

/** A seller authorizes precisely one UTXO and one payment under SINGLE|ANYONECANPAY. */
export function verifySellerPsbt(psbt: string, intent: { txid: string; vout: number; address: string; price: bigint }) {
  const tx = Transaction.fromPSBT(hex.decode(psbt), { allowUnknownInputs: true, allowUnknownOutputs: true, allowLegacyWitnessUtxo: true, disableScriptCheck: true })
  if (tx.inputsLength !== 1 || tx.outputsLength !== 1) throw new Error('The listing transaction changed its inputs or outputs')
  const input = tx.getInput(0)
  const output = tx.getOutput(0)
  const script = hex.encode(OutScript.encode(Address(scureNetwork()).decode(intent.address)))
  if (!input.txid || hex.encode(input.txid) !== intent.txid.toLowerCase() || input.index !== intent.vout || input.sighashType !== 0x83 ||
      output.amount !== intent.price || !output.script || hex.encode(output.script) !== script) {
    throw new Error('The listing transaction does not match the selected UTXO, seller, or exact price')
  }
}
