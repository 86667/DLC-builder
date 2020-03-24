import { ECPair, TransactionBuilder, Transaction } from 'bitcoinjs-lib'
import { networks, payments, script } from 'bitcoinjs-lib'
import * as util from '../src/util'

const network = networks.regtest


// MOON
// alice 1.5
// bob 0.5
// CRASH
// bob 1.5
//alice 0.5

// keys
let alice_init = ECPair.fromWIF("cSYfeE9feJBfKd4WowaG5jhJR1iLBGXE13t15Q9EeyMtC5812PTT",network)
let bob_init = ECPair.fromWIF("cU8hbHD32n887EJ7qXPLqrmvG9jJTUpRJ9vjs8qijzkJpa6EtJ2L",network)

let alice_funding = ECPair.fromWIF("cVcVHfmx8SGxdkeKbfjkW9g7oFV6JvWXxWPoekmUd9egRN978iEG",network)
let bob_funding = ECPair.fromWIF("cQZHCoVmsMtyskmTBHsUFg43GemZELUeMTNWSS674rNzWUK85f61",network)

let alice_sweep = ECPair.fromWIF("cRPM3yaCmyXVKJuuT9mR6Gfji9Lh8LoUMnHcKfyEYFvaMmAqPRGJ",network)
let bob_sweep = ECPair.fromWIF("cVFMT5nYv73PxGHcFgh28UkGZc1vYa388wuBW2KqA8357ebC8qX3",network)

let p_moon = ECPair.fromWIF("cUE2YUeBYDW95DoE48LKAo5LhRn7FHkJTZiJDmQEWESmrdKUaxk8", network)
let p_crash = ECPair.fromWIF("cSn8LLvwZJDaTHW2wGg7p8yzxcPk5Wund9qK6hyq7aQxQno3w7xq", network)
// addresses
let moon_p2sh = util.multisig2of2(alice_sweep.publicKey, p_moon.publicKey, network)
let moon_p2sh_prevScriptOut = util.p2shGetPrevOutScript(moon_p2sh,network)
let crash_p2sh = util.multisig2of2(alice_sweep.publicKey, p_crash.publicKey, network)
let crash_p2sh_prevScriptOut = util.p2shGetPrevOutScript(crash_p2sh,network)

let p2wphk_alice_sweep = payments.p2wpkh({pubkey: alice_sweep.publicKey, network})
let p2wphk_bob_sweep = payments.p2wpkh({pubkey: bob_sweep.publicKey, network})


// funding tx:
// Alice and Bob fund this address
let funding_p2sh = util.multisig2of2(alice_funding.publicKey,bob_funding.publicKey,network)
console.log("funding_p2sh address: "+funding_p2sh.address)
let funding_prevScriptOut = util.p2shGetPrevOutScript(funding_p2sh,network)
console.log("funding_prevScriptOut: "+funding_prevScriptOut.toString())


// funding tx
let funding_txb = new TransactionBuilder(network)
// inputs for initial funds
funding_txb.addInput("a7fa4ec4848d46f6093d1b856a714a226246d77a881563438144c818ae57067a",0)
funding_txb.addInput("af0813dc03c99617700c1c96d8a3a462331536a5f550cc357b4397881503a1b6",1)
funding_txb.addOutput(funding_p2sh.address, 200000000)
// sign
funding_txb.sign(0,alice_init)
funding_txb.sign(1,bob_init)

let funding_tx = funding_txb.build()
console.log(funding_tx)
console.log('\nfunding_tx.toHex()  ', funding_tx.toHex())
let funding_txid = funding_tx.getId()


// CET P_MOON
let cet_moon_txb = new TransactionBuilder(network)
cet_moon_txb.addInput(funding_txid,0,0xFFFFFFFE,Buffer.from(funding_prevScriptOut,'hex'))
cet_moon_txb.addOutput(moon_p2sh.address,150000000)
cet_moon_txb.addOutput(p2wphk_bob_sweep.address,50000000)

cet_moon_txb.sign(0,alice_funding,funding_p2sh.redeem.output)
cet_moon_txb.sign(0,bob_funding,funding_p2sh.redeem.output)
let cet_moon_tx = cet_moon_txb.build()
console.log('\ncet_moon_tx.toHex()  ', cet_moon_tx.toHex())
let cet_moon_txid = cet_moon_tx.getId()


// CET P_CRASH
let cet_crash_txb = new TransactionBuilder(network)
cet_crash_txb.addInput(funding_txid,0,0xFFFFFFFE,Buffer.from(funding_prevScriptOut,'hex'))
cet_crash_txb.addOutput(crash_p2sh.address,50000000)
cet_crash_txb.addOutput(p2wphk_bob_sweep.address,150000000)

cet_crash_txb.sign(0,alice_funding,funding_p2sh.redeem.output)
cet_crash_txb.sign(0,bob_funding,funding_p2sh.redeem.output)
let cet_crash_tx = cet_crash_txb.build()
console.log('\ncet_crash_tx.toHex()  ', cet_crash_tx.toHex())
let cet_crash_txid = cet_moon_tx.getId()


// alice spend CET P_MOON
let spend_cet_moon_txb = new TransactionBuilder(network)
spend_cet_moon_txb.addInput(cet_moon_txid,0,0xFFFFFFFE,Buffer.from(moon_p2sh_prevScriptOut,'hex'))
spend_cet_moon_txb.addOutput(p2wphk_alice_sweep.address,150000000)
spend_cet_moon_txb.sign(0,alice_sweep,moon_p2sh.redeem.output)
spend_cet_moon_txb.sign(0,p_moon,moon_p2sh.redeem.output)

// alice spend CET P_CRASH
let spend_cet_crash_txb = new TransactionBuilder(network)
spend_cet_crash_txb.addInput(cet_crash_txid,0,0xFFFFFFFE,Buffer.from(crash_p2sh_prevScriptOut,'hex'))
spend_cet_crash_txb.addOutput(p2wphk_alice_sweep.address,150000000)
spend_cet_crash_txb.sign(0,alice_sweep,crash_p2sh.redeem.output)
spend_cet_crash_txb.sign(0,p_crash,crash_p2sh.redeem.output)
