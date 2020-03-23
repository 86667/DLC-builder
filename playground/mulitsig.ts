import { ECPair, TransactionBuilder } from 'bitcoinjs-lib'
import { networks, payments, script } from 'bitcoinjs-lib'
import * as util from './util'


// outline of multisig transactions in bitcoinjs
const network = networks.regtest

let alice = ECPair.fromWIF("cVcVHfmx8SGxdkeKbfjkW9g7oFV6JvWXxWPoekmUd9egRN978iEG",network)
let bob = ECPair.fromWIF("cQZHCoVmsMtyskmTBHsUFg43GemZELUeMTNWSS674rNzWUK85f61",network);

let alice1 = ECPair.fromWIF("cRPM3yaCmyXVKJuuT9mR6Gfji9Lh8LoUMnHcKfyEYFvaMmAqPRGJ",network);

const p2wpkhAlice1 = payments.p2wpkh({pubkey: alice1.publicKey, network})


// spending tx
const txb = new TransactionBuilder(network)
let p2sh = util.multisig3of2(alice.publicKey,bob.publicKey,alice1.publicKey,network)
let prevScriptOut = util.p2shGetPrevOutScript(p2sh,network)
txb.addInput("25eb1615c4aae27c81e58529d9500ffd1960b6ba8315f61d30866cb30027b521",0,0xFFFFFFFE,Buffer.from(prevScriptOut,'hex'))
txb.addOutput(p2wpkhAlice1.address, 999e5)

const tx = txb.buildIncomplete()
console.log(tx.ins[0].script)

txb.sign(0, alice, p2sh.redeem.output)
txb.sign(0, bob, p2sh.redeem.output)
//
const tx1 = txb.build()
console.log(tx1.ins[0].script)
console.log('tx.toHex()  ', tx.toHex())
