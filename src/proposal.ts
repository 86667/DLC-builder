import { TransactionBuilder, Transaction, payments  } from 'bitcoinjs-lib'
import { getSpendingPubKey, multisig2of2, sortAnyType, p2shGetPrevOutScript } from './util'
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
  cet_amounts: number[], // amounts returned to this participant in each case
  oracle_messages: string[], // messages to be signed by oracle
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
  public oracle_pubKeys: String[] // UNUSED FOR NOW - oracle pubkey for each event
  network: any

  // proposal state
  public signable: boolean = false // ready for signatures
  public complete: boolean = false // ready for tx broadcast

  // p2sh addresses and scripts for signings
  public funding_p2sh
  public funding_p2sh_prevScriptOut
  public my_cets_spend_key: any[] = []
  public my_cets_spend_key_prevScriptOut: any[] = []

  // transactions
  public funding_txb: TransactionBuilder
  public funding_tx: Transaction = null
  public funding_txid: string
  public my_cets_txb: TransactionBuilder[] = []
  public my_cets_tx: Transaction[] = []
  public my_cets_txid: string[] = []
  public other_cets_txb: TransactionBuilder[] = []
  public other_cets_tx: Transaction[] = []
  public other_cets_txid: string[] = []
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
    let total_fund_amount = this.other.fund_amount+this.me.fund_amount
    assert.deepEqual(this.me.cet_amounts.length,this.other.cet_amounts.length)
    assert.equal(this.me.cet_amounts.length,this.oracle.keys.length)
    assert.equal(total_fund_amount == this.me.cet_amounts.reduce((a, b) => a + b, 0), true)
    assert.equal(total_fund_amount == this.other.cet_amounts.reduce((a, b) => a + b, 0), true)
    for (let i=0;i<this.other.cet_amounts.length;i++) {
      assert.equal(total_fund_amount,
        this.me.cet_amounts[i]+this.other.cet_amounts[i])
    }
    assert.deepEqual(this.me.oracle_messages,this.other.oracle_messages)
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

    // Generate transactions
    this.buildFundingTxb()
    this.buildOthersCETs()
    this.buildMyCETs()
    this.buildRefundTx()
    console.log("Funding, CET 1, CET 2 and refund transactions successfully built.")
  }

  buildFundingTxb() {
    // construct p2h keys
    this.funding_p2sh = multisig2of2(this.me.funding_pub_key, this.other.funding_pub_key,this.network)
    this.funding_p2sh_prevScriptOut = p2shGetPrevOutScript(this.funding_p2sh, this.network)

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
    let network = this.network
    for (let i=0;i<this.oracle.keys.length;i++) {
      // construct CET spending keys and store prevScriptOuts
      let cet_spend_key = payments.p2wpkh({
        pubkey: getSpendingPubKey(this.me.oracle_messages[i],this.other.sweep_pub_key),
        network
      })
      // build txs
      let other_cet1_txb = new TransactionBuilder(this.network)
      other_cet1_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
      other_cet1_txb.addOutput(cet_spend_key.address,this.other.cet_amounts[i]-DEFAULT_FEE/2)
      other_cet1_txb.addOutput(this.me.final_output_addr,this.me.cet_amounts[i]-DEFAULT_FEE/2)
      this.other_cets_txid.push(other_cet1_txb.buildIncomplete().getId())
      this.other_cets_txb.push(other_cet1_txb)
    }
  }

  buildMyCETs() {
    let network = this.network
    // build txs
    for (let i=0;i<this.oracle.keys.length;i++) {
      // construct CET spending keys and store prevScriptOuts
      this.my_cets_spend_key.push( payments.p2wpkh({
        pubkey: getSpendingPubKey(this.me.oracle_messages[i],this.me.sweep_pub_key),
        network
      }))
      this.my_cets_spend_key_prevScriptOut.push(p2shGetPrevOutScript(this.my_cets_spend_key[i],this.network))

      let my_cet1_txb = new TransactionBuilder(this.network)
      my_cet1_txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
      my_cet1_txb.addOutput(this.my_cets_spend_key[i].address,this.me.cet_amounts[i]-DEFAULT_FEE/2)
      my_cet1_txb.addOutput(this.other.final_output_addr,this.other.cet_amounts[i]-DEFAULT_FEE/2)
      this.my_cets_txid.push(my_cet1_txb.buildIncomplete().getId())
      this.my_cets_txb.push(my_cet1_txb)
    }
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
    for (let i=0;i<this.oracle.keys.length;i++) {
      this.my_cets_txb[i].sign(txb_sign_arg,funding_key)
      this.other_cets_txb[i].sign(txb_sign_arg,funding_key)
    }
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
    // get funding tx signatures
    let funding_tx_sigs = []
    this.funding_txb.buildIncomplete().ins.forEach(input => {
      funding_tx_sigs.push(input.witness)
    })
    // get CET signatures
    let other_cets_tx_sig = []
    for (let i=0;i<this.oracle.keys.length;i++) {
      other_cets_tx_sig.push(this.other_cets_txb[i].buildIncomplete().ins[0].witness.slice(1,3))
    }
    // get refund tx sig
    let refund_tx_sig = this.refund_txb.buildIncomplete().ins[0].witness.slice(1,3)

    console.log("Successfully build Accept object.")
    this.me_accept = new DLC_Accept(
      12345,
      funding_tx_sigs,
      this.funding_txid,
      other_cets_tx_sig,
      this.other_cets_txid,
      refund_tx_sig,
      this.refund_txid
    )
    return this.me_accept
  }

  // include DLC_Accept object to own transaction builders and build transactions
  includeAcceptObject(signatures: DLC_Accept) {
    this.other_accept = signatures
    //funding tx
    if (signatures.funding_txid &&
      signatures.funding_txid != this.funding_txid) {
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

    // cet txs
    for (let i=0;i<this.oracle.keys.length;i++) {
      if (signatures.cets_txid[i] &&
        signatures.cets_txid[i] != this.my_cets_txid[i]) {
        throw "ERROR: cet"+i+" txid does not match."
      }
      let my_cet_tx = this.my_cets_txb[i].buildIncomplete()
      if (!(my_cet_tx.ins[0].witness[1].length)) { // if sig not present
        my_cet_tx.ins[0].witness[1] = signatures.cets_tx_sig[i][0]
      }
      if (!(my_cet_tx.ins[0].witness[2].length)) { // if sig not present
        my_cet_tx.ins[0].witness[1] = signatures.cets_tx_sig[i][1]
      }
      this.my_cets_tx.push(my_cet_tx)
    }

    // refund tx
    if (signatures.refund_txid &&
      signatures.refund_txid != this.refund_txid) {
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
  includeAcceptObjectSerialized(serialised_signatures: any[]) {
    if (!(this.other_accept)) {
      var accept = new DLC_Accept()
    }
    accept.deserialize(serialised_signatures)
    this.includeAcceptObject(accept)
  }
}

// object with signatures from all signed txs for sending to other participant
export class DLC_Accept {
  public proposalId: number
  public funding_tx_sigs: Buffer[][]
  public funding_txid: string // for validation of tx building
  public cets_tx_sig: Buffer[][]
  public cets_txid: string[]
  public refund_tx_sig: Buffer[]
  public refund_txid: string
  constructor(
    proposalId?: number,
    funding_tx_sigs?: Buffer[][],
    funding_txid?: string,
    cets_tx_sig?: Buffer[][],
    cets_txid?: string[],
    refund_tx_sig?: Buffer[],
    refund_txid?: string
  ){
    this.proposalId = proposalId
    this.funding_tx_sigs = funding_tx_sigs
    this.funding_txid = funding_txid
    this.cets_tx_sig = cets_tx_sig
    this.cets_txid = cets_txid
    this.refund_tx_sig = refund_tx_sig
    this.refund_txid = refund_txid
  }
  // TODO: do this properly
  serialize() {
    return [
        this.proposalId,
        this.funding_tx_sigs,
        this.cets_tx_sig,
        this.refund_tx_sig
      ]
  }
  // TODO: do this properly
  deserialize(data: any[]) {
    this.proposalId = data[0]
    this.funding_tx_sigs = data[1]
    this.cets_tx_sig = data[2]
    this.refund_tx_sig = data[3]
    this.funding_txid = null
    this.cets_txid = []
    this.refund_txid = null

  }
}
