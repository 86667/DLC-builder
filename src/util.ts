import { ECPair, TransactionBuilder, Transaction, networks, opcodes, payments, script } from 'bitcoinjs-lib'
import * as ecc from 'tiny-secp256k1'

export const COIN=100000000
export function btcToSat(value: number) { return Math.ceil(parseFloat((value / (1/COIN)).toString().substring(0,10))) }
export function satToBtc(value: number) { return parseFloat((value * (1/COIN)).toString().substring(0,10)) }

// used in sort() to order txid and addresses
export function sortAnyType(array: any[]) {
  if (array[0].txid) { // inputs
    array.sort(
      (a, b) => (
        parseInt(a.txid.substring(0,4),16) > parseInt(b.txid.substring(0,4),16)
      ) ? 1 : -1)
  } else if (array[0].addr) { // funding tx output
    array.sort(
      (a, b) => (
        parseInt(a.addr.substring(4,9),36) > parseInt(b.addr.substring(4,9),36)
      ) ? 1 : -1)
  } else {
    throw "sortAnyType() does not support ordering of given type."
  }
  return array
}

// return multi sig 2-of-2 p2wsh address for given keys
export function multisig2of2(key1: Buffer, key2: Buffer, network: any) {
  let keys = [key1,key2]
    .sort((a, b) => (parseInt(a.toString('hex').substring(0,5),16) >= parseInt(b.toString('hex').substring(0,5),16))? 1 : -1)
  const p2ms = payments.p2ms({
    m: 2, pubkeys: [
    keys[0],keys[1]
    ], network})
    return payments.p2wsh({redeem: p2ms, network})
}
// make CET outptut 0:
// - tweaked 'my' private key sig to unlock winning amount
//    || 'other' key sig after delay for winning amount
export function cltvCETtxOutputWitnessScript(expected_spender: Buffer, delayed_spender: Buffer, locktime: number) {
  return script.compile([
    opcodes.OP_IF,
    script.number.encode(locktime),
    opcodes.OP_CHECKLOCKTIMEVERIFY,
    opcodes.OP_DROP,
    delayed_spender,
    opcodes.OP_CHECKSIG,
    opcodes.OP_ELSE,
    expected_spender,
    opcodes.OP_CHECKSIG,
    opcodes.OP_ENDIF
  ])
}
// sign a branch of 'my' CET (A + P) option
export function myCetTxOutput0Sign(tx: Transaction, witnessScript: Buffer, amount: number,  key: any) {
  const signatureHash = tx.hashForWitnessV0(0, witnessScript, amount, Transaction.SIGHASH_ALL)
  tx.setWitness(0, payments.p2wsh({
    redeem: {
      input: script.compile([
        script.signature.encode(key.sign(signatureHash), Transaction.SIGHASH_ALL),
        opcodes.OP_FALSE
      ]),
      output: witnessScript
    }
  }).witness)
  return tx
}
// sign a branch of 'other' CET (delay + B) option
export function otherCetTxOutput0Sign(tx: Transaction, witnessScript: Buffer, amount: number, key: any) {
  const signatureHash = tx.hashForWitnessV0(0, witnessScript, amount, Transaction.SIGHASH_ALL)
  tx.setWitness(0, payments.p2wsh({
    redeem: {
      input: script.compile([
        script.signature.encode(key.sign(signatureHash), Transaction.SIGHASH_ALL),
        opcodes.OP_TRUE
      ]),
      output: witnessScript
    }
  }).witness)
  return tx
}
// find prevOutScript for p2wsh - this is the scriptPubKey for p2sh output
export function p2wshGetPrevOutScript(p2wsh: any, network: any) {
  const fund_txb = new TransactionBuilder(network)
  fund_txb.addOutput(p2wsh.address, 999e5)
  return fund_txb.buildIncomplete().outs[0].script.toString('hex')
}

// add oracle pub key to sweep key
export function getSpendingPubKey(sG_value: any, sweep_pub_key: Buffer) {
  return ecc.pointAdd(sweep_pub_key,sG_value.getEncoded())
}

// tweak key to generate spending key from sweep_funds key for some outcome
export function getSpendingPrivKey(oracle_sig: number, sweep_key: { privateKey: Buffer }) {
  return ECPair.fromPrivateKey(
    ecc.privateAdd(sweep_key.privateKey,Buffer.from(oracle_sig.toString(16),'hex')))
}

// Testing
// gen new key
export function newKey() {
  return ECPair.makeRandom({network: networks.regtest}).toWIF()
}
export function addrForKey(key: any) {
  return payments.p2pkh({ pubkey: key.publicKey, network: networks.regtest }).address;
}
// Turn message into 32 byte public key
export function msgToPubKey(msg: string) {
  let key = ECPair.fromPrivateKey(msgToPrivKey(msg))
  return key.publicKey
}
// used in testing. Turn message into 32 byte priv key
export function msgToPrivKey(msg: string) {
  if (isNaN(parseInt(msg))) { throw "msg must be int" }
  if (msg.length > 64) { throw "msg too long"}
  // pad with 0s
  msg = msg.concat((new Array(65-msg.length)).join("0"))
  return Buffer.from(msg,'hex')
}
