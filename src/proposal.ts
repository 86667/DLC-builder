import { Transaction, TransactionBuilder, Psbt, ECPair } from 'bitcoinjs-lib'
import { multisig2of2, p2shGetPrevOutScript } from './util'

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
  case1_out_amount: number, // amount returned to this participant in case 1
  case2_out_amount: number, //          "               "          in case 2
  init_pub_keys: Buffer[], // pubkeys of funding inputs
  funding_pub_key: Buffer,
  sweep_pub_key: Buffer,
  init_utxos: input[], // funding inputs
  change_amount: number, // change from funding inputs amount
  change_addr: string, // change address
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
  public case1_pubKey: String // UNUSED FOR NOW - oracle pubkey for event 1
  public case2_pubKey: String // UNUSED FOR NOW - oracle pubkey for event 2
  network: any

  // proposal state
  public signable: boolean = false // ready for signatures
  public complete: boolean = false // ready for tx broadcast

  // p2sh addresses and script
  public funding_p2sh
  public funding_p2sh_prevScriptOut
  public cet1_p2sh
  public cet1_p2sh_prevScriptOut
  public cet2_p2sh
  public cet2_p2sh_prevScriptOut

  // transcations
  public funding_txb: TransactionBuilder
  funding_txid: string
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
    // verify init keys sign for all inputs
    // verify all fields set
    return true
  }

  // build all transaction builders ready for sigs
  buildTxbs() {
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
    this.funding_txb = this.buildFundingTxb()
    this.cet1_txb = this.buildCET1Tx()
    this.cet2_txb = this.buildCET2Tx()
    console.log("Funding, CET 1, CET 2 transactions successfully built.")
  }

  buildFundingTxb() {
    let txb = new TransactionBuilder(this.network)
    this.alice.init_utxos.forEach(input => {
      txb.addInput(input.txid,input.vout)
    })
    this.bob.init_utxos.forEach(input => {
      txb.addInput(input.txid,input.vout)
    })
    // outputs - funding p2sh
    let amount = (this.alice.fund_amount + this.bob.fund_amount)
      - (this.alice.change_amount + this.bob.change_amount)
    txb.addOutput(this.funding_p2sh.address, amount)
    // change
    txb.addOutput(this.alice.change_addr,this.alice.change_amount)
    txb.addOutput(this.bob.change_addr,this.bob.change_amount)

    this.funding_txid = txb.buildIncomplete().getId()
    return txb
  }

  signfundingTxb(init_keys: any[]) {
    let signed = 0
    for (let i=0;i<(this.alice.init_utxos.length+this.bob.init_utxos.length);i++) {
      try {
        this.funding_txb.sign(i,init_keys[signed],null,Transaction.SIGHASH_NONE)
        signed++
      } catch(err) {
        // ensure correct error is caught
        if (!(err.toString().includes("Key pair cannot sign for this input")
          || err.toString().includes("sign requires keypair"))) {
            throw err
          }
      }
    }
    if (signed != init_keys.length) {
      throw "Error: Some keys did not successfully sign."
    }
    console.log("Funding tx successfully signed.")
  }

  buildCET1Tx() {
    let txb = new TransactionBuilder(this.network)
    txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    txb.addOutput(this.cet1_p2sh.address,this.alice.case1_out_amount)
    txb.addOutput(this.bob.final_output_addr,this.bob.case1_out_amount)
    return txb
  }

  buildCET2Tx() {
    let txb = new TransactionBuilder(this.network)
    txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    txb.addOutput(this.cet2_p2sh.address,this.alice.case2_out_amount)
    txb.addOutput(this.bob.final_output_addr,this.bob.case2_out_amount)
    return txb
  }

  signCETtxs(funding_key: any) {
    this.cet1_txb.sign(0,funding_key,this.funding_p2sh.redeem.output)
    console.log("CET 1 tx successfully signed.")
    this.cet2_txb.sign(0,funding_key,this.funding_p2sh.redeem.output)
    console.log("CET 2 tx successfully signed.")
  }

  // construct DLC_Accept object
  buildAcceptObject() {
    // get signatures
    let funding_tx_sigs = []
    this.funding_txb.buildIncomplete().ins.forEach(input => {
      funding_tx_sigs.push(input.script)
    })
    let cet1_tx_sig = this.cet1_txb.buildIncomplete().ins[0].script
    let cet2_tx_sig = this.cet2_txb.buildIncomplete().ins[0].script
    return new DLC_Accept(
      12345,
      this.funding_txid,
      funding_tx_sigs,
      cet1_tx_sig,
      cet2_tx_sig
    )
  }
}

// object with signatures from all signed txs for sending to other participant
export class DLC_Accept {
  public proposalId: number
  public funding_txid: string // for validation of tx building
  public funding_tx_sigs: Buffer[]
  public cet1_tx_sig: Buffer
  public cet2_tx_sig: Buffer
  constructor(
    proposalId: number,
    funding_txid: string,
    funding_tx_sigs: Buffer[],
    cet1_tx_sig: Buffer,
    cet2_tx_sig: Buffer,
  ){
    this.proposalId = proposalId
    this.funding_txid = funding_txid
    this.funding_tx_sigs = funding_tx_sigs
    this.cet1_tx_sig = cet1_tx_sig
    this.cet2_tx_sig = cet2_tx_sig
  }
  serialize() {}
}
