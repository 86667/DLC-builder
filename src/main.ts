import { Psbt, ECPair, payments, networks } from 'bitcoinjs-lib'
import { DLC_Proposal } from './proposal'

/**
  For DLC we require:
    - Each Participant must provide:
        -atleast 3 keys:
          - init_pub_keys[]: public keys to spend utxos to fund contract
          - funding_pub_key: public key to unlock funds from funding tx
          - sweep_pub_key: public key to unlock funds from CETs
        - init_utxos[]: UTXOs to fund DLC contract
        - init_change_addr: address for change output of funding tx inptus
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
let bob_init = ECPair.fromWIF("cU8hbHD32n887EJ7qXPLqrmvG9jJTUpRJ9vjs8qijzkJpa6EtJ2L",network)
let alice_funding = ECPair.fromWIF("cVcVHfmx8SGxdkeKbfjkW9g7oFV6JvWXxWPoekmUd9egRN978iEG",network)
let bob_funding = ECPair.fromWIF("cQZHCoVmsMtyskmTBHsUFg43GemZELUeMTNWSS674rNzWUK85f61",network)
let alice_sweep = ECPair.fromWIF("cRPM3yaCmyXVKJuuT9mR6Gfji9Lh8LoUMnHcKfyEYFvaMmAqPRGJ",network)
let bob_sweep = ECPair.fromWIF("cVFMT5nYv73PxGHcFgh28UkGZc1vYa388wuBW2KqA8357ebC8qX3",network)

let p_moon = ECPair.fromWIF("cUE2YUeBYDW95DoE48LKAo5LhRn7FHkJTZiJDmQEWESmrdKUaxk8", network)
let p_crash = ECPair.fromWIF("cSn8LLvwZJDaTHW2wGg7p8yzxcPk5Wund9qK6hyq7aQxQno3w7xq", network)

let p2wphk_alice = payments.p2wpkh({pubkey: alice_init.publicKey, network})
let p2wphk_bob = payments.p2wpkh({pubkey: bob_init.publicKey, network})

let alice = {
  fund_amount: 10,
  init_pub_keys: [alice_init.publicKey],
  funding_pub_key: alice_funding.publicKey,
  sweep_pub_key: alice_sweep.publicKey,
  init_utxos: [{ "txid":"a7fa4ec4848d46f6093d1b856a714a226246d77a881563438144c818ae57067a","vout":0 }],
  init_change_addr: p2wphk_alice.address,
  final_output_addr: p2wphk_alice.address
}
let bob = {
  fund_amount: 10,
  init_pub_keys: [bob_init.publicKey],
  funding_pub_key: bob_funding.publicKey,
  sweep_pub_key: bob_sweep.publicKey,
  init_utxos: [{ "txid":"a7fa4ec4848d46f6093d1b856a714a226246d77a881563438144c818ae57067a","vout":1 }],
  init_change_addr: p2wphk_bob.address,
  final_output_addr: p2wphk_bob.address
}

let prop = new DLC_Proposal(network)
prop.alice = alice
prop.bob = bob
prop.oracle.keys = [ p_moon, p_crash ]

prop.isSignable()
prop.accept([ alice_init ], alice_funding)
console.log(prop.funding_txb.buildIncomplete())
// this works. input scriptSig produced same as in dlc.ts example
// write oCET tx builders next
