import { ECPair, payments, networks } from 'bitcoinjs-lib'
import { DLC_Proposal } from './src/proposal'
import { Participant } from './src/participant'
import { btcToSat, satToBtc } from './src/util'
import { Oracle } from './src/oracle'

 const network = networks.regtest

// keys
let alice_init = ECPair.fromWIF("cSYfeE9feJBfKd4WowaG5jhJR1iLBGXE13t15Q9EeyMtC5812PTT",network)
let bob_init = ECPair.fromWIF("cN8AWM536QQvzAa5DhnQHydJniyH7YjPzrsEkZAX42Autvg1A4TE",network)
let alice_funding = ECPair.fromWIF("cVcVHfmx8SGxdkeKbfjkW9g7oFV6JvWXxWPoekmUd9egRN978iEG",network)
let bob_funding = ECPair.fromWIF("cQZHCoVmsMtyskmTBHsUFg43GemZELUeMTNWSS674rNzWUK85f61",network)
let alice_sweep = ECPair.fromWIF("cRPM3yaCmyXVKJuuT9mR6Gfji9Lh8LoUMnHcKfyEYFvaMmAqPRGJ",network)
let bob_sweep = ECPair.fromWIF("cVFMT5nYv73PxGHcFgh28UkGZc1vYa388wuBW2KqA8357ebC8qX3",network)

let alice_change_p2wpkh = payments.p2wpkh({pubkey: alice_init.publicKey, network})
let bob_change_p2wpkh = payments.p2wpkh({pubkey: bob_init.publicKey, network})

let alice = new Participant(
  50000000,
  [ 150000000,50000000 ],
  [ "1", "2" ],
  0,
  alice_funding.publicKey,
  alice_sweep.publicKey,
  [{ "txid":"d002255a571e9dc4deeb9b4197dc7c91cc148178eb67fcfb1dca57595b762140","vout":0,"prevTxScript":"0014af0e2bc17aa42251597e52a7d4792bbf6b556c21","value":btcToSat(0.50010000) }],
  10000,
  alice_change_p2wpkh.address,
  alice_change_p2wpkh.address,
  100,
  500
)
let bob = new Participant(
  150000000,
  [ 50000000, 150000000 ],
  [ "1", "2" ],
  0,
  bob_funding.publicKey,
  bob_sweep.publicKey,
  [{ "txid":"5849465dc9971a7ee2133987733911e2088a8dece174cb8e8e6a8a9e66cdbac5","vout":1,"prevTxScript":"0014cf90e707600bc808aa9804c596b8ef227718294f","value":btcToSat(1.50010000) }],
  10000,
  bob_change_p2wpkh.address,
  bob_change_p2wpkh.address,
  100,
  500
)
export { alice, bob, alice_init, alice_funding, network }

setup()
run()

function setup() {
  console.log("alice address: "+alice_change_p2wpkh.address)
  console.log("pay her "+ satToBtc(alice.fund_amount+alice.change_amount))
  console.log("bob address: "+bob_change_p2wpkh.address)
  console.log("pay him "+ satToBtc(bob.fund_amount+bob.change_amount))
  console.log("\nSend funds to the above and edit the init_utxos section for each participant.\n")
}
function run() {
  let oracle = new Oracle
  oracle.newEvent()

  let alice_prop = new DLC_Proposal(network)
  alice_prop.me = alice
  alice_prop.other = bob
  alice_prop.oracle = oracle
  alice_prop.isSignable()
  alice_prop.buildTxbs()

  alice_prop.signFundingTxb([ alice_init ])
  alice_prop.signCETtxbs(alice_funding)
  alice_prop.signRefundTxb(alice_funding)

  let alice_sigs = alice_prop.buildAcceptObject()
  let alice_sigs_serialized = alice_sigs.serialize()

  let bob_prop = new DLC_Proposal(network)
  bob_prop.me = bob
  bob_prop.other = alice
  bob_prop.oracle = oracle
  bob_prop.isSignable()
  bob_prop.buildTxbs()

  bob_prop.signFundingTxb([ bob_init ])
  bob_prop.signCETtxbs(bob_funding)
  bob_prop.signRefundTxb(bob_funding)

  //include alice's sigs into bobs transactions
  // bob_prop.includeAcceptObject(alice_sigs)
  bob_prop.includeAcceptObjectSerialized(alice_sigs_serialized)

  // include bobs sigs into Alice's transactions
  alice_prop.includeAcceptObject(bob_prop.buildAcceptObject())

  console.log("\nfunding_tx: "+bob_prop.funding_tx.toHex())
  alice_prop.my_cets_tx.forEach((cet_tx, index) => {
    console.log("\nmy_cet"+index+"_tx: "+cet_tx.toHex())
  })
  console.log("\nrefund_tx: "+bob_prop.refund_tx.toHex())

  let oracle_signed_msg = oracle.signMsg(0,"1")
  // BROADCAST FUNDING TX AND BOBS CET 0 TX
  // bob spend cet 0 output0
  let spending_tx_bob = bob_prop.spendMyCETtxOutput0(0,oracle_signed_msg,bob_sweep)
  console.log("\nbob spending tx: "+spending_tx_bob.toHex())
  // alice spend  CET 0 output0 after CLTV time passed
  let spending_tx_alice = alice_prop.spendOtherCETtxOutput0(0,alice_sweep)
  console.log("\nalice spending tx: "+spending_tx_alice.toHex())
}
