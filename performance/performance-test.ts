import { alice, bob, alice_init, alice_funding, network } from '../src/demo'
import { DLC_Proposal } from '../src/proposal'
import { Oracle } from '../src/oracle'
import {performance} from 'perf_hooks'
var sizeof = require('object-sizeof')
let oracle = new Oracle
oracle.newEvent()


// number of CET transactions
let runs = [2,10,100,1000,10000]
let res = []
runs.forEach((run, index) => {
  // reset
  let alice_prop = new DLC_Proposal(network)
  alice_prop.oracle = oracle
  let new_alice = alice
  new_alice.cet_amounts = new Array(run).fill(1000);
  new_alice.oracle_messages = new Array(run).fill("hello");
  let new_bob = bob
  new_bob.cet_amounts = new Array(run).fill(1000);
  new_bob.oracle_messages = new Array(run).fill("hello");
  alice_prop.me = alice
  alice_prop.other = bob
  alice_prop.signable = true // bypass validation
  var t0 = performance.now()
  alice_prop.buildTxbs()
  var t1 =  performance.now()
  res.push([t1-t0])

  // console.log("txb size: "+sizeof(alice_prop.my_cets_txb[0])+" bytes")
  var t0 = performance.now()
  alice_prop.signFundingTxb([ alice_init ])
  alice_prop.signCETtxbs(alice_funding)
  alice_prop.signRefundTxb(alice_funding)
  var t1 =  performance.now()
  res[index].push(t1-t0)

  // console.log("txb with sigs size: "+sizeof(alice_prop.my_cets_txb[0])+" bytes")
})

runs.forEach((run, index) => {
  console.log("\nFor "+run+" CET transactions")
  console.log("Build time "+res[index][0])
  console.log("Sign time "+res[index][1])

})
