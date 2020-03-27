import { ECPair, TransactionBuilder } from 'bitcoinjs-lib'
import { networks, payments } from 'bitcoinjs-lib'
import * as ecc from 'tiny-secp256k1'

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
// used in testing. Turn message into 32 byte priv key
export function msgToPrivKey(msg: string) {
  if (isNaN(parseInt(msg))) { throw "msg must be int" }
  if (msg.length > 64) { throw "msg too long"}
  // pad with 0s
  msg = msg.concat((new Array(65-msg.length)).join("0"))
  return Buffer.from(msg,'hex')
}
// used in testing. Turn message into 32 byte public key
export function msgToPubKey(msg: string) {
  let key = ECPair.fromPrivateKey(msgToPrivKey(msg))
  return key.publicKey
}
// add oracle pub key to sweep funds key
export function getSpendingPubKey(oracleMsg: string, sweep_pub_key: Buffer) {
  return ecc.pointAdd(sweep_pub_key,msgToPubKey(oracleMsg))
}
// tweak key to generate spending key from sweep_funds key for some outcome
export function getSpendingPrivKey(oracleMsg: string, sweep_key: any) {
  let oracle_msg_priv = msgToPrivKey(oracleMsg)
  return ECPair.fromPrivateKey(ecc.privateAdd(sweep_key.privateKey,oracle_msg_priv))
}
