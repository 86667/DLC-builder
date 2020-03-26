import { ECPair, TransactionBuilder } from 'bitcoinjs-lib'
import { networks, payments } from 'bitcoinjs-lib'
export const COIN=100000000
export function btcToSat(value: number) { return Math.ceil(parseFloat((value / (1/COIN)).toString().substring(0,10))) }
export function satToBtc(value: number) { return parseFloat((value * (1/COIN)).toString().substring(0,10)) }

// gen new key
export function newKey() {
  return ECPair.makeRandom({network: networks.regtest}).toWIF()
}
export function addrForKey(key: any) {
  return payments.p2pkh({ pubkey: key.publicKey, network: networks.regtest }).address;
}

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
export function multisig2of2(key1: Buffer, key2: Buffer, network: any) {
  let keys = [key1,key2]
    .sort((a, b) => (parseInt(a.toString('hex').substring(0,5),16) >= parseInt(b.toString('hex').substring(0,5),16))? 1 : -1)
  const p2ms = payments.p2ms({
    m: 2, pubkeys: [
    keys[0],keys[1]
    ], network})
    return payments.p2wsh({redeem: p2ms, network})
}
// return p2sh address
export function multisig3of2(key1: Buffer, key2: Buffer, key3: Buffer, network: any) {
  const p2ms = payments.p2ms({
    m: 2, pubkeys: [
    key1,key2,key3
    ], network})
    return payments.p2sh({redeem: p2ms, network})
}
// find prevOutScript for p2sh - this is the scriptPubKey for p2sh output
export function p2shGetPrevOutScript(p2sh: any, network: any) {
  const fund_txb = new TransactionBuilder(network)
  fund_txb.addOutput(p2sh.address, 999e5)
  return fund_txb.buildIncomplete().outs[0].script.toString('hex')
}
