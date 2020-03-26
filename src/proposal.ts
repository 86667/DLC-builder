import { TransactionBuilder, Transaction } from 'bitcoinjs-lib'
import { multisig2of2, sortAnyType, p2shGetPrevOutScript } from './util'
import * as assert from 'assert'

const DEFAULT_FEE = 300

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
  final_output_addr: string,
  refund_locktime: number
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
  public my_cet1_txb: TransactionBuilder
  public my_cet1_tx: Transaction = null
  public my_cet1_txid: string
  public my_cet2_txb: TransactionBuilder
  public my_cet2_tx: Transaction = null
  public my_cet2_txid: string
  public other_cet1_txb: TransactionBuilder
  public other_cet1_tx: Transaction = null
  public other_cet1_txid: string
  public other_cet2_txb: TransactionBuilder
  public other_cet2_tx: Transaction = null
  public other_cet2_txid: string
  public refund_txb: TransactionBuilder
  public refund_tx: Transaction
  public refund_txid: string

  public me_accept: DLC_Accept = null
  public other_accept: DLC_Accept = null

  constructor(network: any) {
    this.network = network
  }

  // check if all proposal fields exist and valid
  isSignable() {
    this.validateParticipants()
    // check all fields set correctly
    if (this.oracle.keys.length != 2 ) { throw "Not enough Oracle keys "}
    this.signable = true
    return true
  }

  validateParticipants() {
    // verify input utxos can cover funds by asking blockchain
    // verify init keys sign for all inputs
    // verify all fields
    assert.equal(this.other.fund_amount+this.me.fund_amount >=
      this.me.case1_out_amount+this.me.case2_out_amount, true)
    assert.equal(this.me.case1_out_amount,this.other.case2_out_amount)
    assert.equal(this.me.case2_out_amount,this.other.case1_out_amount)
    assert.equal(this.me.funding_pub_key.length==33,true)
    assert.equal(this.other.funding_pub_key.length==33,true)
    assert.equal(this.me.sweep_pub_key.length==33,true)
    assert.equal(this.other.sweep_pub_key.length==33,true)
    assert.equal(this.me.init_pub_keys.length,this.me.init_utxos.length)
    assert.equal(this.other.init_pub_keys.length,this.other.init_utxos.length)
    assert.equal(this.other.change_amount > DEFAULT_FEE/2, true)
    assert.equal(this.me.change_addr.length==44,true)
    assert.equal(this.other.change_addr.length==44,true)
    assert.equal(this.me.final_output_addr.length==44,true)
    assert.equal(this.other.final_output_addr.length==44,true)
    assert.equal(this.me.refund_locktime,this.other.refund_locktime)
    return true
  }

  // build all transaction builders ready for sigs
  buildTxbs() {
    if (!(this.signable)) { throw "proposal not ready for signatures. please run isSignable()"}

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
    this.buildRefundTx()
    console.log("Funding, CET 1, CET 2 and refund transactions successfully built.")
  }

  buildFundingTxb() {
    let txb = new TransactionBuilder(this.network)
    // ensure consistent ordering
    let inputs = sortAnyType(this.me.init_utxos.concat(this.other.init_utxos))
    inputs.forEach((input: input) => {
      txb.addInput(input.txid,input.vout,null,Buffer.from(input.prevTxScript,'hex'))
    })
    // outputs - funding p2sh
    txb.addOutput(this.funding_p2sh.address, this.me.fund_amount + this.other.fund_amount)
    // change
    let change_outputs = []
    if (this.me.change_amount > 0) {
      change_outputs.push({"addr":this.me.change_addr,"amount":this.me.change_amount-DEFAULT_FEE/2})
    }
    if (this.other.change_amount > 0) {
      change_outputs.push({ "addr":this.other.change_addr,"amount":this.other.change_amount-DEFAULT_FEE/2})
    }
    sortAnyType(change_outputs).forEach(output => {
      txb.addOutput(output.addr,output.amount)
    })

    this.funding_txb = txb
    this.funding_txid = txb.buildIncomplete().getId()
  }

  signFundingTxb(init_keys: any[]) {
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
    other_cet1_txb.addOutput(other_cet1_p2sh.address,this.other.case1_out_amount-DEFAULT_FEE/2)
    other_cet1_txb.addOutput(this.me.final_output_addr,this.me.case1_out_amount-DEFAULT_FEE/2)
    this.other_cet1_txid = other_cet1_txb.buildIncomplete().getId()
    this.other_cet1_txb = other_cet1_txb

    let other_cet2_txb = new TransactionBuilder(this.network)
    other_cet2_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    other_cet2_txb.addOutput(other_cet2_p2sh.address,this.other.case2_out_amount-DEFAULT_FEE/2)
    other_cet2_txb.addOutput(this.me.final_output_addr,this.me.case2_out_amount-DEFAULT_FEE/2)
    this.other_cet2_txid = other_cet2_txb.buildIncomplete().getId()
    this.other_cet2_txb = other_cet2_txb
  }

  buildMyCETs() {
    let my_cet1_txb = new TransactionBuilder(this.network)
    my_cet1_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    my_cet1_txb.addOutput(this.my_cet1_p2sh.address,this.me.case1_out_amount-DEFAULT_FEE/2)
    my_cet1_txb.addOutput(this.other.final_output_addr,this.other.case1_out_amount-DEFAULT_FEE/2)
    this.my_cet1_txid = my_cet1_txb.buildIncomplete().getId()
    this.my_cet1_txb = my_cet1_txb

    let my_cet2_txb = new TransactionBuilder(this.network)
    my_cet2_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    my_cet2_txb.addOutput(this.my_cet2_p2sh.address,this.me.case2_out_amount-DEFAULT_FEE/2)
    my_cet2_txb.addOutput(this.other.final_output_addr,this.other.case2_out_amount-DEFAULT_FEE/2)
    this.my_cet2_txid = my_cet2_txb.buildIncomplete().getId()
    this.my_cet2_txb = my_cet2_txb
  }

  signCETtxbs(funding_key: any) {
    let txb_sign_arg = {
      prevOutScriptType: 'p2wsh-p2ms',
      vin: 0,
      keyPair: {
        publicKey: funding_key.publicKey,
        __D: funding_key.privateKey,
        sign: funding_key.sign
      },
      witnessScript: this.funding_p2sh.redeem.output,
      witnessValue: this.me.fund_amount + this.other.fund_amount
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

  buildRefundTx() {
    let refund_txb = new TransactionBuilder(this.network)
    refund_txb.setLockTime(this.me.refund_locktime)
    refund_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
    let change_outputs = []
    change_outputs.push({"addr":this.me.final_output_addr,"amount":this.me.fund_amount-DEFAULT_FEE/2})
    change_outputs.push({ "addr":this.other.final_output_addr,"amount":this.other.fund_amount-DEFAULT_FEE/2})
    sortAnyType(change_outputs).forEach(output => {
      refund_txb.addOutput(output.addr,output.amount)
    })
    this.refund_txid = refund_txb.buildIncomplete().getId()
    this.refund_txb = refund_txb
  }

  signRefundTxb(funding_key: any) {
    let txb_sign_arg = {
      prevOutScriptType: 'p2wsh-p2ms',
      vin: 0,
      keyPair: {
        publicKey: funding_key.publicKey,
        __D: funding_key.privateKey,
        sign: funding_key.sign
      },
      witnessScript: this.funding_p2sh.redeem.output,
      witnessValue: this.me.fund_amount + this.other.fund_amount
    }
    this.refund_txb.sign(txb_sign_arg,funding_key)
    console.log("Refund tx successfully signed.")
  }

  // construct DLC_Accept object
  buildAcceptObject() {
    // get signatures
    let funding_tx_sigs = []
    this.funding_txb.buildIncomplete().ins.forEach(input => {
      funding_tx_sigs.push(input.witness)
    })
    // get signature section of witness
    let other_cet1_tx_sig = this.other_cet1_txb.buildIncomplete().ins[0].witness.slice(1,3)
    let other_cet2_tx_sig = this.other_cet2_txb.buildIncomplete().ins[0].witness.slice(1,3)
    let refund_tx_sig = this.refund_txb.buildIncomplete().ins[0].witness.slice(1,3)
    console.log("Successfully build Accept object.")
    return new DLC_Accept(
      12345,
      funding_tx_sigs,
      this.funding_txid,
      other_cet1_tx_sig,
      this.other_cet1_txid,
      other_cet2_tx_sig,
      this.other_cet2_txid,
      refund_tx_sig,
      this.refund_txid
    )
  }

  // include DLC_Accept object to own transaction builders and build transactions
  includeAcceptObject(signatures: DLC_Accept) {
    if (signatures.funding_txid != this.funding_txid) {
      throw "ERROR: Funding txid does not match."
    }
    let funding_tx = this.funding_txb.buildIncomplete()
    let signed = 0
    funding_tx.ins.forEach( input => {
      if (input.witness.length == 0) {
        input.witness = signatures.funding_tx_sigs[signed]
        signed++
      }
    })
    if (signed != this.other.init_utxos.length) {
      throw "Error: Some witnesses were not included in funding transaction."
    }
    this.funding_tx = funding_tx

    // my_cet1
    if (signatures.cet1_txid != this.my_cet1_txid) {
      throw "ERROR: cet1 txid does not match."
    }
    let my_cet1_tx = this.my_cet1_txb.buildIncomplete()
    if (!(my_cet1_tx.ins[0].witness[1].length)) { // if sig not present
      my_cet1_tx.ins[0].witness[1] = signatures.cet1_tx_sig[0]
    }
    if (!(my_cet1_tx.ins[0].witness[2].length)) { // if sig not present
      my_cet1_tx.ins[0].witness[1] = signatures.cet1_tx_sig[1]
    }
    this.my_cet1_tx = my_cet1_tx

    // my_cet2
    if (signatures.cet2_txid != this.my_cet2_txid) {
      throw "ERROR: cet2 txid does not match."
    }
    let my_cet2_tx = this.my_cet2_txb.buildIncomplete()
    if (!(my_cet2_tx.ins[0].witness[1].length)) { // if sig not present
      my_cet2_tx.ins[0].witness[1] = signatures.cet2_tx_sig[0]
    }
    if (!(my_cet2_tx.ins[0].witness[2].length)) { // if sig not present
      my_cet2_tx.ins[0].witness[1] = signatures.cet2_tx_sig[1]
    }
    this.my_cet2_tx = my_cet2_tx

    // refund
    if (signatures.refund_txid != this.refund_txid) {
      throw "ERROR: refund txid does not match."
    }
    let refund_tx = this.refund_txb.buildIncomplete()
    if (!(refund_tx.ins[0].witness[1].length)) { // if sig not present
      refund_tx.ins[0].witness[1] = signatures.refund_tx_sig[0]
    }
    if (!(refund_tx.ins[0].witness[2].length)) { // if sig not present
      refund_tx.ins[0].witness[1] = signatures.refund_tx_sig[1]
    }
    this.refund_tx = refund_tx

    console.log("Successfully included Accept object signatures into all transactions."
      + " Fully built transactions found in: this.funding_tx, this.my_cet1, this.my_cet2 and this.refund_tx.")
  }
}

// object with signatures from all signed txs for sending to other participant
export class DLC_Accept {
  public proposalId: number
  public funding_tx_sigs: Buffer[][]
  public funding_txid: string // for validation of tx building
  public cet1_tx_sig: Buffer[]
  public cet1_txid: string
  public cet2_tx_sig: Buffer[]
  public cet2_txid: string
  public refund_tx_sig: Buffer[]
  public refund_txid: string
  constructor(
    proposalId: number,
    funding_tx_sigs: Buffer[][],
    funding_txid: string,
    cet1_tx_sig: Buffer[],
    cet1_txid: string,
    cet2_tx_sig: Buffer[],
    cet2_txid: string,
    refund_tx_sig: Buffer[],
    refund_txid: string
  ){
    this.proposalId = proposalId
    this.funding_tx_sigs = funding_tx_sigs
    this.funding_txid = funding_txid
    this.cet1_tx_sig = cet1_tx_sig
    this.cet1_txid = cet1_txid
    this.cet2_tx_sig = cet2_tx_sig
    this.cet2_txid = cet2_txid
    this.refund_tx_sig = refund_tx_sig
    this.refund_txid = refund_txid
  }
  serialize() {}
}
