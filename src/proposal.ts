import { TransactionBuilder, Transaction } from 'bitcoinjs-lib'
import { multisig2of2, p2shGetPrevOutScript } from './util'

interface input {
  txid: string,
  vout: number,
  prevTxScript: string,
  value: number
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
  public me: Participant
  public other: Participant
  public oracle: Oracle = { keys: [] }
  public case1_pubKey: String // UNUSED FOR NOW - oracle pubkey for event 1
  public case2_pubKey: String // UNUSED FOR NOW - oracle pubkey for event 2
  network: any

  // proposal state
  public signable: boolean = false // ready for signatures
  public complete: boolean = false // ready for tx broadcast

  // p2sh addresses and scripts for signings
  public funding_p2sh
  public funding_p2sh_prevScriptOut
  public my_cet1_p2sh
  public my_cet1_p2sh_prevScriptOut
  public my_cet2_p2sh
  public my_cet2_p2sh_prevScriptOut

  // transactions
  public funding_txb: TransactionBuilder
  public funding_tx: Transaction = null
  public funding_txid: string
  public funding_amount: number
  public my_cet1_txb: TransactionBuilder
  public my_cet2_txb: TransactionBuilder
  public other_cet1_txb: TransactionBuilder
  public other_cet2_txb: TransactionBuilder

  public me_accept: DLC_Accept = null
  public other_accept: DLC_Accept = null

  constructor(network: any) {
    this.network = network
  }

  // check if all proposal fields exist and valid
  isSignable() {
    this.validateParticipant(this.me)
    this.validateParticipant(this.other)
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
    // calculate total funding amount
    this.funding_amount = (this.me.fund_amount + this.other.fund_amount)
      - (this.me.change_amount + this.other.change_amount)

    // construct funding p2h keys
    this.funding_p2sh = multisig2of2(this.me.funding_pub_key, this.other.funding_pub_key,this.network)
    this.funding_p2sh_prevScriptOut = p2shGetPrevOutScript(this.funding_p2sh, this.network)

    // construct CET p2sh keys
    this.my_cet1_p2sh = multisig2of2(this.me.sweep_pub_key, this.oracle.keys[0].publicKey, this.network)
    this.my_cet1_p2sh_prevScriptOut = p2shGetPrevOutScript(this.my_cet1_p2sh,this.network)
    this.my_cet2_p2sh = multisig2of2(this.me.sweep_pub_key, this.oracle.keys[1].publicKey, this.network)
    this.my_cet2_p2sh_prevScriptOut = p2shGetPrevOutScript(this.my_cet2_p2sh,this.network)

    // Generate transactions and signatures
    this.buildFundingTxb()
    this.buildOthersCETs()
    this.buildMyCETs()
    console.log("Funding, CET 1, CET 2 transactions successfully built.")
  }

  buildFundingTxb() {
    let txb = new TransactionBuilder(this.network)
    // sort by txid
    let inputs = this.me.init_utxos.concat(this.other.init_utxos)
      .sort((a, b) => (parseInt(a.txid.substring(0,5),16) > parseInt(b.txid.substring(0,5),16)) ? 1 : -1)
    inputs.forEach((input: input) => {
      txb.addInput(input.txid,input.vout,null,Buffer.from(input.prevTxScript,'hex'))
    })
    // outputs - funding p2sh
    txb.addOutput(this.funding_p2sh.address, this.funding_amount - 200)
    // change
    let change_outputs = []
    if (this.me.change_amount > 0) {
      change_outputs.push({"addr":this.me.change_addr,"amount":this.me.change_amount})
    }
    if (this.other.change_amount > 0) {
      change_outputs.push({ "addr":this.other.change_addr,"amount":this.other.change_amount})
    }
    change_outputs.sort((a, b) => (a.amount >= b.amount)? 1 : -1)
    change_outputs.forEach(output => {
      txb.addOutput(output.addr,output.amount)
    })

    this.funding_txb = txb
    this.funding_txid = txb.buildIncomplete().getId()
  }

  signfundingTxb(init_keys: any[]) {
    let signed = 0
    // TODO: inefficient
    for (let i=0;i<(this.me.init_utxos.length+this.other.init_utxos.length);i++) {
      try {
        let txb_sign_arg = { // segwit txs must sign with TxbSignArg interface
          prevOutScriptType: 'p2wpkh',
          vin: i,
          keyPair: {
            publicKey: init_keys[signed].publicKey,
            __D: init_keys[signed].privateKey,
            sign: init_keys[signed].sign
          },
          witnessValue: this.me.init_utxos[signed].value
        }
        this.funding_txb.sign(txb_sign_arg,init_keys[signed])
        signed++
      } catch(err) {
        // ensure correct error is caught
        if (!(err.toString().includes("Key pair cannot sign for this input")
          || err.toString().includes("Cannot read property 'publicKey' of undefined")
          || err.toString().includes("Error: witnesspubkeyhash not supported"))) {
            throw err
          }
      }
    }
    if (signed != init_keys.length) {
      throw "Error: Some keys did not successfully sign."
    }
    console.log("Funding tx successfully signed.")
  }

  buildOthersCETs() {
    // construct CET p2sh keys
    let other_cet1_p2sh = multisig2of2(this.other.sweep_pub_key, this.oracle.keys[0].publicKey, this.network)
    let other_cet2_p2sh = multisig2of2(this.other.sweep_pub_key, this.oracle.keys[1].publicKey, this.network)

    let other_cet1_txb = new TransactionBuilder(this.network)
    other_cet1_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    other_cet1_txb.addOutput(other_cet1_p2sh.address,this.other.case1_out_amount)
    other_cet1_txb.addOutput(this.me.final_output_addr,this.me.case1_out_amount)
    this.other_cet1_txb = other_cet1_txb

    let other_cet2_txb = new TransactionBuilder(this.network)
    other_cet2_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    other_cet2_txb.addOutput(other_cet2_p2sh.address,this.other.case2_out_amount)
    other_cet2_txb.addOutput(this.me.final_output_addr,this.me.case2_out_amount)
    this.other_cet2_txb = other_cet2_txb
  }

  buildMyCETs() {
    let my_cet1_txb = new TransactionBuilder(this.network)
    my_cet1_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    my_cet1_txb.addOutput(this.my_cet1_p2sh.address,this.me.case1_out_amount)
    my_cet1_txb.addOutput(this.other.final_output_addr,this.other.case1_out_amount)
    this.my_cet1_txb = my_cet1_txb

    let my_cet2_txb = new TransactionBuilder(this.network)
    my_cet2_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    my_cet2_txb.addOutput(this.my_cet2_p2sh.address,this.me.case2_out_amount)
    my_cet2_txb.addOutput(this.other.final_output_addr,this.other.case2_out_amount)
    this.my_cet2_txb = my_cet2_txb
  }

  signCETtxs(funding_key: any) {
    let txb_sign_arg = {
      prevOutScriptType: 'p2wsh-p2ms',
      vin: 0,
      keyPair: {
        publicKey: funding_key.publicKey,
        __D: funding_key.privateKey,
        sign: funding_key.sign
      },
      witnessScript: this.funding_p2sh.redeem.output,
      witnessValue: this.funding_amount
    }
    this.my_cet1_txb.sign(txb_sign_arg,funding_key)
    console.log("my CET 1 tx successfully signed.")
    this.my_cet2_txb.sign(txb_sign_arg,funding_key)
    console.log("my CET 2 tx successfully signed.")
    this.other_cet1_txb.sign(txb_sign_arg,funding_key)
    console.log("other CET 1 tx successfully signed.")
    this.other_cet2_txb.sign(txb_sign_arg,funding_key)
    console.log("other CET 2 tx successfully signed.")
  }

  // construct DLC_Accept object
  buildAcceptObject() {
    // get signatures
    let funding_tx_sigs = []
    this.funding_txb.buildIncomplete().ins.forEach(input => {
      funding_tx_sigs.push(input.witness)
    })
    let other_cet1_tx_sig = this.other_cet1_txb.buildIncomplete().ins[0].script
    let other_cet2_tx_sig = this.other_cet2_txb.buildIncomplete().ins[0].script
    return new DLC_Accept(
      12345,
      this.funding_txid,
      funding_tx_sigs,
      other_cet1_tx_sig,
      other_cet2_tx_sig
    )
  }

  // include DLC_Accept object to own transaction builders
  includeAcceptObject(signatures: DLC_Accept) {
    if (signatures.funding_txid != this.funding_txid) {
      throw "ERROR: Funding txid does not match."
    }
    let funding_tx = this.funding_txb.buildIncomplete()
    console.log(funding_tx)
    let signed = 0
    funding_tx.ins.forEach( input => {
      if (input.witness.length == 0) {
        input.witness = signatures.funding_tx_sigs[signed]
        signed++
      }
    })
    // if (signed != signatures.funding_tx_sigs.length) {
    //   throw "Error: Some keys did not successfully sign."
    // }
    this.funding_tx = funding_tx
  }
}

// object with signatures from all signed txs for sending to other participant
export class DLC_Accept {
  public proposalId: number
  public funding_txid: string // for validation of tx building
  public funding_tx_sigs: Buffer[][]
  public cet1_tx_sig: Buffer
  public cet2_tx_sig: Buffer
  constructor(
    proposalId: number,
    funding_txid: string,
    funding_tx_sigs: Buffer[][],
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
