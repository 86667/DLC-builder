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
      - CET locktime (how long before allowing refund)
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


let alice_change_p2wphk = payments.p2wpkh({pubkey: alice_init.publicKey, network})
let bob_change_p2wphk = payments.p2wpkh({pubkey: bob_init.publicKey, network})

let alice = {
  fund_amount: 50000000,
  case1_out_amount: 150000000,
  case2_out_amount: 50000000,
  init_pub_keys: [alice_init.publicKey],
  funding_pub_key: alice_funding.publicKey,
  sweep_pub_key: alice_sweep.publicKey,
  init_utxos: [{ "txid":"6155785f531d1b2080aa794891cea8ddb612baed0bf173458be3a18469bcd0fc","vout":0,"prevTxScript":"0014af0e2bc17aa42251597e52a7d4792bbf6b556c21","value":100000000 }],
  change_amount: 100,
  change_addr: alice_change_p2wphk.address,
  final_output_addr: alice_change_p2wphk.address
}
let bob = {
  fund_amount: 150000000,
  case1_out_amount: 50000000,
  case2_out_amount: 150000000,
  init_pub_keys: [bob_init.publicKey],
  funding_pub_key: bob_funding.publicKey,
  sweep_pub_key: bob_sweep.publicKey,
  init_utxos: [{ "txid":"d87a2dc078558f73110f0b42227620473f58bc3fd093a9b45cc111a4077030b6","vout":0,"prevTxScript":"0014cf90e707600bc808aa9804c596b8ef227718294f","value":100000000 }],
  change_amount: 100,
  change_addr: bob_change_p2wphk.address,
  final_output_addr: bob_change_p2wphk.address
}

let prop = new DLC_Proposal(network)
prop.alice = alice
prop.bob = bob
prop.oracle.keys = [ p_moon, p_crash ]

prop.isSignable()
prop.buildTxbs()
prop.signfundingTxb([ alice_init ])
prop.signfundingTxb([ bob_init ])
prop.signCETtxs(alice_funding)
prop.signCETtxs(bob_funding)

console.log('\nfunding_tx.toHex()  ', prop.funding_txb.build().toHex())
console.log('\ncet1_tx.toHex()  ', prop.cet1_txb.build().toHex())
console.log('\ncet2_tx.toHex()  ', prop.cet2_txb.build().toHex())

let signatures = prop.buildAcceptObject()
console.log(signatures)
// prop.includeAcceptObject(signatures)
