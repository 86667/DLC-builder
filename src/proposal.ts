import { TransactionBuilder, Psbt, ECPair } from 'bitcoinjs-lib'
import { multisig2of2, p2shGetPrevOutScript } from '../util'

interface witnessUtxo {
  script: Buffer,
  value: number
}
interface input {
  txid: string,
  vout: number,
  witnessUtxo?: witnessUtxo
}
interface output {
  address: string,
  value: number
}

interface Participant {
  fund_amount: number,
  init_pub_keys: Buffer[],
  funding_pub_key: Buffer,
  sweep_pub_key: Buffer,
  init_utxos: input[],
  init_change_addr: string,
  final_output_addr: string
}

interface Oracle {
  keys: any[] // full keys for demo
}

// class containing all info necessary for DLC.
// This can be passed back and forth between participants until agreement is reached
// DLC_Accept presence signals proposal stage over (as long as other agrees)
export class DLC_Proposal {
  public alice: Participant
  public bob: Participant
  public oracle: Oracle = { keys: [] }
  network: any

  public signable: boolean = false // ready for signatures
  public complete: boolean = false // ready for construction

  // p2sh addresses and script
  public funding_p2sh
  public funding_p2sh_prevScriptOut
  public cet1_p2sh
  public cet1_p2sh_prevScriptOut
  public cet2_p2sh
  public cet2_p2sh_prevScriptOut

  // transcations
  public funding_txb: TransactionBuilder
  public cet1_txb: TransactionBuilder
  public cet2_txb: TransactionBuilder

  public alice_accept: DLC_Accept = null
  public bob_accept: DLC_Accept = null

  constructor(network: any) {
    this.network = network
  }

  // check if all proposal fields exist and valid
  isSignable() {
    this.validateParticipant(this.alice)
    this.validateParticipant(this.bob)
    // check all fields set correctly
    if (this.oracle.keys.length != 2 ) { throw "Not enough Oracle keys "}

    this.signable = true
    return true
  }
  validateParticipant(participant: Participant) {
    // verify input utxos can cover funds by asking blockchain
    // verify init keys sign for all
    // verify all fields set
    return true
  }

  // This method replaces creates/replaces an accept object for the relevant
  // participant.
  // inputs: ECPair keys for each signature
  accept(init_keys: any[], funding_key: object) {
    if (!(this.signable)) { throw "proposal not ready for signatures. please run isSignable()"}
    // Object to add signatures to for transmission

    // construct funding p2h keys
    this.funding_p2sh = multisig2of2(this.alice.funding_pub_key, this.bob.funding_pub_key,this.network)
    this.funding_p2sh_prevScriptOut = p2shGetPrevOutScript(this.funding_p2sh, this.network)

    // construct CET p2sh keys
    this.cet1_p2sh = multisig2of2(this.alice.sweep_pub_key, this.oracle.keys[0].publicKey, this.network)
    this.cet1_p2sh_prevScriptOut = p2shGetPrevOutScript(this.cet1_p2sh,this.network)
    this.cet2_p2sh = multisig2of2(this.alice.sweep_pub_key, this.oracle.keys[1].publicKey, this.network)
    this.cet2_p2sh_prevScriptOut = p2shGetPrevOutScript(this.cet2_p2sh,this.network)

    // Generate transactions and signatures
    this.funding_txb = this.genFundingTxb(init_keys)

  }

  genFundingTxb(init_keys: any[]) {
    let txb = new TransactionBuilder(this.network)
    this.alice.init_utxos.forEach(input => {
      txb.addInput(input.txid,input.vout)
    })
    this.bob.init_utxos.forEach(input => {
      txb.addInput(input.txid,input.vout)
    })
    //output
    let amount = this.alice.fund_amount + this.bob.fund_amount
    txb.addOutput(this.funding_p2sh.address, amount)
    //sign
    let signed = 0
    for (let i=0;i<(this.alice.init_utxos.length+this.bob.init_utxos.length);i++) {
      console.log(i)
      try {
        txb.sign(signed,init_keys[signed])
        signed++
      } catch(err) { // TODO ensure correct error is caught
        console.log(err)
      }
    }

    return txb
  }

}

export class DLC_Accept {
  proposal: DLC_Proposal
  constructor(proposal: DLC_Proposal, ) {
    this.proposal = proposal
    if (!(this.proposal.signable)) { throw "proposal not ready for signatures"}

  }
}
