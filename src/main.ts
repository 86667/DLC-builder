import { ECPair, payments, networks } from 'bitcoinjs-lib'
import { DLC_Proposal } from './proposal'

/**
  For DLC we require:
    - from each Participant:
        -atleast 3 keys:
          - init_pub_keys[]: public keys to spend utxos to fund contract
          - funding_pub_key: public key to unlock funds from funding tx
          - sweep_pub_key: public key to unlock funds from CETs
        - init_utxos[]: UTXOs to fund DLC contract
        - change_addr: address for change output of funding tx inptus
        - final_output_addr - also refund address
    - oracle information:
      - In the demo case simply public keys for each outcome
    - network: {bitcoin, testnet, regtest}
    - DLC parameters:
      - funding amount for each participant
      - (not implemented) CSV delay
      - Refund Locktime (block or unix time after which refund tx is valid)
 */

/**
   1. Alice (proposer) creates Proposal object containing terms of DLC and sends
   to Bob
   2. Bob updates proposal with his info, makes any changes and returns to
   Alice.
   3. Once Alice and bob are in agreement, one of them constructs and signs each
   tx and sends to the other to do the same.
   4. Send funding tx. The contract is now ready
 */

 const network = networks.regtest

// keys
let alice_init = ECPair.fromWIF("cSYfeE9feJBfKd4WowaG5jhJR1iLBGXE13t15Q9EeyMtC5812PTT",network)
let bob_init = ECPair.fromWIF("cN8AWM536QQvzAa5DhnQHydJniyH7YjPzrsEkZAX42Autvg1A4TE",network)
let alice_funding = ECPair.fromWIF("cVcVHfmx8SGxdkeKbfjkW9g7oFV6JvWXxWPoekmUd9egRN978iEG",network)
let bob_funding = ECPair.fromWIF("cQZHCoVmsMtyskmTBHsUFg43GemZELUeMTNWSS674rNzWUK85f61",network)
let alice_sweep = ECPair.fromWIF("cRPM3yaCmyXVKJuuT9mR6Gfji9Lh8LoUMnHcKfyEYFvaMmAqPRGJ",network)
let bob_sweep = ECPair.fromWIF("cVFMT5nYv73PxGHcFgh28UkGZc1vYa388wuBW2KqA8357ebC8qX3",network)

let p_moon = ECPair.fromWIF("cUE2YUeBYDW95DoE48LKAo5LhRn7FHkJTZiJDmQEWESmrdKUaxk8", network)
let p_crash = ECPair.fromWIF("cSn8LLvwZJDaTHW2wGg7p8yzxcPk5Wund9qK6hyq7aQxQno3w7xq", network)

let alice_change_p2wpkh = payments.p2wpkh({pubkey: alice_init.publicKey, network})
let bob_change_p2wpkh = payments.p2wpkh({pubkey: bob_init.publicKey, network})
console.log("alice address: "+alice_change_p2wpkh.address)
console.log("bob address: "+bob_change_p2wpkh.address)

let alice = {
  fund_amount: 50000050,
  case1_out_amount: 150000000,
  case2_out_amount: 50000000,
  init_pub_keys: [alice_init.publicKey],
  funding_pub_key: alice_funding.publicKey,
  sweep_pub_key: alice_sweep.publicKey,
  init_utxos: [{ "txid":"6155785f531d1b2080aa794891cea8ddb612baed0bf173458be3a18469bcd0fc","vout":0,"prevTxScript":"0014af0e2bc17aa42251597e52a7d4792bbf6b556c21","value":100000000 }],
  change_amount: 10000,
  change_addr: alice_change_p2wpkh.address,
  final_output_addr: alice_change_p2wpkh.address,
  refund_locktime: 1000
}
let bob = {
  fund_amount: 150000050,
  case1_out_amount: 50000000,
  case2_out_amount: 150000000,
  init_pub_keys: [bob_init.publicKey],
  funding_pub_key: bob_funding.publicKey,
  sweep_pub_key: bob_sweep.publicKey,
  init_utxos: [{ "txid":"fb2e10a4da2389fd1c4746f00a6670d9dc494c46c1a5e1325b6a19c705105f7b","vout":1,"prevTxScript":"0014cf90e707600bc808aa9804c596b8ef227718294f","value":100000000 }],
  change_amount: 10000,
  change_addr: bob_change_p2wpkh.address,
  final_output_addr: bob_change_p2wpkh.address,
  refund_locktime: 1000
}

let alice_prop = new DLC_Proposal(network)
alice_prop.me = alice
alice_prop.other = bob
alice_prop.oracle.keys = [ p_moon, p_crash ]
alice_prop.isSignable()
alice_prop.buildTxbs()

alice_prop.signFundingTxb([ alice_init ])
alice_prop.signCETtxbs(alice_funding)
alice_prop.signRefundTxb(alice_funding)

let signatures1 = alice_prop.buildAcceptObject()
// console.log(signatures1)


let bob_prop = new DLC_Proposal(network)
bob_prop.me = bob
bob_prop.other = alice
bob_prop.oracle.keys = [ p_moon, p_crash ]
bob_prop.isSignable()
bob_prop.buildTxbs()

bob_prop.signFundingTxb([ bob_init ])
bob_prop.signCETtxbs(bob_funding)
bob_prop.signRefundTxb(bob_funding)

bob_prop.includeAcceptObject(signatures1)

console.log("\nfunding_tx: "+bob_prop.funding_tx.toHex())
console.log("\nmy_cet1_tx: "+bob_prop.my_cet1_tx.toHex())
console.log("\nmy_cet2_tx: "+bob_prop.my_cet2_tx.toHex())
console.log("\nrefund_tx: "+bob_prop.refund_tx.toHex())
