import { ECPair, TransactionBuilder } from 'bitcoinjs-lib'
import { networks, payments } from 'bitcoinjs-lib'

// gen new key
export function newKey() {
  return ECPair.makeRandom({network: networks.regtest}).toWIF()
}
export function addrForKey(key: any) {
  return payments.p2pkh({ pubkey: key.publicKey, network: networks.regtest }).address;
}
// return p2sh address
export function multisig3of2(key1: Buffer, key2: Buffer, key3: Buffer, network: any) {
  const p2ms = payments.p2ms({
    m: 2, pubkeys: [
    key1,key2,key3
    ], network})
    return payments.p2sh({redeem: p2ms, network})
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
// find prevOutScript for p2sh - this is the scriptPubKey for p2sh output
export function p2shGetPrevOutScript(p2sh: any, network: any) {
  const fund_txb = new TransactionBuilder(network)
  fund_txb.addOutput(p2sh.address, 999e5)
  return fund_txb.buildIncomplete().outs[0].script.toString('hex')
}
