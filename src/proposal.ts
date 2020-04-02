import { TransactionBuilder, Transaction, payments } from 'bitcoinjs-lib'
import {
  cltvCETtxOutputWitnessScript,
  getSpendingPrivKey,
  getSpendingPubKey,
  multisig2of2,
  myCetTxOutput0Sign,
  otherCetTxOutput0Sign,
  sortAnyType,
  p2shGetPrevOutScript
 } from './util'
 import { getPubs } from './schnorr'
 import { Oracle } from './oracle'
import * as assert from 'assert'

const DEFAULT_FEE = 300

interface input {
  txid: string,
  vout: number,
  prevTxScript: string,
  value: number
}

interface Participant {
  fund_amount: number,
  cet_amounts: number[], // amounts returned to this participant in each case
  oracle_messages: string[], // messages to be signed by oracle
  oracle_event_id: number, // event id
  init_pub_keys: Buffer[], // pubkeys of funding inputs
  funding_pub_key: Buffer,
  sweep_pub_key: Buffer,
  init_utxos: input[], // funding inputs
  change_amount: number, // change from funding inputs amount
  change_addr: string, // change address
  final_output_addr: string,
  cltv_locktime: number,
  refund_locktime: number
}


// class containing all info necessary for DLC.
// This can be passed back and forth between participants until agreement is reached
// DLC_Accept presence signals proposal stage over (as long as other agrees)
export class DLC_Proposal {
  public me: Participant
  public other: Participant
  public oracle: Oracle
  oracle_sG_values: any
  network: any

  // proposal state
  public signable: boolean = false // ready for signatures
  public complete: boolean = false // ready for tx broadcast

  // p2sh addresses and scripts for signings
  public funding_p2sh: any
  public funding_p2sh_prevScriptOut: string
  public my_cets_spend_key: any[] = []
  public my_cets_p2wsh: any[] = []
  public other_cet_spend_key: any[] = []

  // transactions
  public funding_txb: TransactionBuilder
  public funding_tx: Transaction = null
  public funding_txid: string
  public my_cets_txb: TransactionBuilder[] = []
  public my_cets_tx: Transaction[] = []
  public my_cet_txids: string[] = []
  public other_cets_txb: TransactionBuilder[] = []
  public other_cet_txids: string[] = []
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
    this.signable = true
    return true
  }
  validateParticipants() {
    // verify input utxos can cover funds by asking blockchain
    // verify init keys sign for all inputs
    // verify all fields
    let total_fund_amount = this.other.fund_amount+this.me.fund_amount
    assert.deepEqual(this.me.cet_amounts.length,this.other.cet_amounts.length)
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

    // find oracles sG values
    this.oracle_sG_values = getPubs(
      this.oracle.getR(this.me.oracle_event_id),
      this.oracle.pub_key,
      this.me.oracle_messages)

    // Generate transactions
    this.buildFundingTxb()
    this.buildOthersCETs()
    this.buildMyCETs()
    this.buildRefundTx()
    console.log("Funding, CETs and refund transactions successfully built.")
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
    for (let i=0;i<this.me.oracle_messages.length;i++) {
      // spend key for branch (A+P)
      this.other_cet_spend_key.push(payments.p2wpkh({
        pubkey: getSpendingPubKey(this.oracle_sG_values[i],this.other.sweep_pub_key),
        network
      }))
      // construct CET p2wsh address
      const witnessScript = cltvCETtxOutputWitnessScript(this.other_cet_spend_key[i].pubkey, this.me.sweep_pub_key, this.me.cltv_locktime)
      const p2wsh_addr = payments.p2wsh({redeem: {output: witnessScript, network}, network})

      const txb = new TransactionBuilder(network)
      txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
      txb.addOutput(p2wsh_addr.address,this.other.cet_amounts[i]-DEFAULT_FEE/2)
      txb.addOutput(this.me.final_output_addr,this.me.cet_amounts[i]-DEFAULT_FEE/2)

      this.other_cet_txids.push(txb.buildIncomplete().getId())
      this.other_cets_txb.push(txb)
    }
  }

  buildMyCETs() {
    let network = this.network
    // build txs
    for (let i=0;i<this.me.oracle_messages.length;i++) {
      // spend key for branch (A+P)
      this.my_cets_spend_key.push( payments.p2wpkh({
        pubkey: getSpendingPubKey(this.oracle_sG_values[i],this.me.sweep_pub_key),
        network
      }))
      // construct CET p2wsh address
      const witnessScript = cltvCETtxOutputWitnessScript(this.my_cets_spend_key[i].pubkey, this.other.sweep_pub_key, this.me.cltv_locktime)
      const p2wsh_addr = payments.p2wsh({redeem: {output: witnessScript, network}, network})

      const txb = new TransactionBuilder(network)
      txb.addInput(this.funding_txid,0,0xFFFFFFFE,Buffer.from(this.funding_p2sh_prevScriptOut,'hex'))
      txb.addOutput(p2wsh_addr.address,this.me.cet_amounts[i]-DEFAULT_FEE/2)
      txb.addOutput(this.other.final_output_addr,this.other.cet_amounts[i]-DEFAULT_FEE/2)

      this.my_cet_txids.push(txb.buildIncomplete().getId())
      this.my_cets_txb.push(txb)
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
    for (let i=0;i<this.me.oracle_messages.length;i++) {
      this.my_cets_txb[i].sign(txb_sign_arg,funding_key)
      this.other_cets_txb[i].sign(txb_sign_arg,funding_key)
    }
  }
  // spend CET output0 with my sweep key + oracle key
  spendMyCETtxOutput0(cet_case: number, oracle_sig: any, key: any) {
    let amount = this.my_cets_tx[cet_case].outs[0].value
    const txb = new TransactionBuilder(this.network)
    txb.setLockTime(0)
    txb.addInput(this.my_cet_txids[cet_case],0,0xfffffffe)
    txb.addOutput(this.me.final_output_addr, amount-DEFAULT_FEE)
    const tx = txb.buildIncomplete()

    // tweak key with oracle msg
    let tweaked_key = getSpendingPrivKey(oracle_sig,key)
    let witnessScript = cltvCETtxOutputWitnessScript(
      this.my_cets_spend_key[cet_case].pubkey,
      this.other.sweep_pub_key,
      this.me.cltv_locktime)
    return myCetTxOutput0Sign(tx, witnessScript, amount, tweaked_key)
  }
  // spend CET output0 with my sweep key
  spendOtherCETtxOutput0(cet_case: number, key: any) {
    let amount = this.my_cets_tx[cet_case].outs[1].value
    const txb = new TransactionBuilder(this.network)
    txb.setLockTime(this.me.cltv_locktime)
    txb.addInput(this.other_cet_txids[cet_case],0,0xfffffffe)
    txb.addOutput(this.me.final_output_addr, amount-DEFAULT_FEE)
    const tx = txb.buildIncomplete()

    let witnessScript = cltvCETtxOutputWitnessScript(
      this.other_cet_spend_key[cet_case].pubkey,
      this.me.sweep_pub_key,
      this.me.cltv_locktime)
    return otherCetTxOutput0Sign(tx, witnessScript, amount, key)
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
      if (input.witness.length != 0) { funding_tx_sigs.push(input.witness) }
    })
    // get CET signatures
    let other_cet_tx_sigs = []
    for (let i=0;i<this.me.oracle_messages.length;i++) {
      let sigs = this.other_cets_txb[i].buildIncomplete().ins[0].witness.slice(1,3)
      sigs.forEach(sig => {
        if (sig.length != 0) { other_cet_tx_sigs.push(sig) }
    })
    }
    // get refund tx sig
    let refund_tx_sig: Buffer
    let sigs = this.refund_txb.buildIncomplete().ins[0].witness.slice(1,3)
    sigs.forEach(sig => {
      if (sig.length != 0) { refund_tx_sig = sig }
    })
    console.log("Successfully build Accept object.")
    this.me_accept = new DLC_Accept(
      12345,
      funding_tx_sigs,
      this.funding_txid,
      other_cet_tx_sigs,
      this.other_cet_txids,
      refund_tx_sig,
      this.refund_txid
    )
    return this.me_accept
  }

  // include DLC_Accept object in own transaction builders and build transactions
  includeAcceptObject(signatures: DLC_Accept) {
    this.other_accept = signatures
    //funding tx
    if (signatures.funding_txid &&
      signatures.funding_txid != this.funding_txid) {
      throw "ERROR: Funding txid does not match."
    }
    let funding_tx = this.funding_txb.buildIncomplete()
    let signed = 0
    funding_tx.ins.forEach( (input) => {
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
    for (let i=0;i<this.me.oracle_messages.length;i++) {
      if (signatures.cet_txids[i] &&
        signatures.cet_txids[i] != this.my_cet_txids[i]) {
        throw "ERROR: cet"+i+" txid does not match."
      }
      let my_cet_tx = this.my_cets_txb[i].buildIncomplete()
      if (my_cet_tx.ins[0].witness[1].length == 0) { // if sig not present
        my_cet_tx.ins[0].witness[1] = signatures.cet_tx_sigs[i]
      } else {
        my_cet_tx.ins[0].witness[2] = signatures.cet_tx_sigs[i]
      }
      this.my_cets_tx.push(my_cet_tx)
    }

    // refund tx
    if (signatures.refund_txid &&
      signatures.refund_txid != this.refund_txid) {
      throw "ERROR: refund txid does not match."
    }
    let refund_tx = this.refund_txb.buildIncomplete()
    if (refund_tx.ins[0].witness[1].length == 0) { // if sig not present
      refund_tx.ins[0].witness[1] = signatures.refund_tx_sig
    } else {
      refund_tx.ins[0].witness[2] = signatures.refund_tx_sig
    }
    this.refund_tx = refund_tx
    console.log("Successfully included Accept object signatures into all transactions.")
  }
  includeAcceptObjectSerialized(serialised_signatures: Buffer) {
    if (!(this.other_accept)) {
      var accept = new DLC_Accept()
    }
    accept.deserialize(serialised_signatures)
    this.includeAcceptObject(accept)
  }
}

// object with signatures from all signed txs for sending to other participant
export class DLC_Accept {
  public proposalId: number = 1
  public funding_tx_sigs: Buffer[][]
  public funding_txid: string // for validation of tx building
  public cet_tx_sigs: Buffer[]
  public cet_txids: string[]
  public refund_tx_sig: Buffer
  public refund_txid: string
  constructor(
    proposalId?: number,
    funding_tx_sigs?: Buffer[][],
    funding_txid?: string,
    cet_tx_sigs?: Buffer[],
    cet_txids?: string[],
    refund_tx_sig?: Buffer,
    refund_txid?: string
  ){
    if (proposalId >= 2**16) { throw "proposal ID must be 16-bit"}
    this.proposalId = proposalId
    this.funding_tx_sigs = funding_tx_sigs
    this.funding_txid = funding_txid
    this.cet_tx_sigs = cet_tx_sigs
    this.cet_txids = cet_txids
    this.refund_tx_sig = refund_tx_sig
    this.refund_txid = refund_txid
  }
  // TODO: do this properly
  serialize() {
    // buffer with ordering and size info of signatures
    let buffer = Buffer.allocUnsafe(3);
    let offset = 0

    // proposal ID
    offset = buffer.writeUInt16LE(this.proposalId, offset)

    // funding sigs data
    // number of funding sigs to come
    offset = buffer.writeUInt8(this.funding_tx_sigs.length, offset)
    // for each funding tx signature create new buffer and append.
    // 'sig_data' buffer is:
    //     number of entries in sig || size of entry 1 || entry 1 || size of entry 2 || entry 2 ...
    let funding_sig_data: Buffer[] = [] // array of sig_data buffers to concat to main buffer
    this.funding_tx_sigs.forEach(sig => {
      let sig_data = Buffer.alloc(1)
      sig_data.writeUInt8(sig.length,0)
      sig.forEach(item => {
        let item_data = Buffer.alloc(1)
        item_data.writeUInt8(item.length,0)
        item_data = Buffer.concat([ item_data, item ])
        sig_data = Buffer.concat([ sig_data, item_data ])
      })
      funding_sig_data.push(sig_data)
    })
    buffer = Buffer.concat([ buffer ].concat(funding_sig_data, Buffer.alloc(1)))
    offset = buffer.length-1

    // cet sigs data
    // number of cet sigs to come
    offset = buffer.writeUInt8(this.cet_tx_sigs.length, offset)
    let cet_sig_data: Buffer[] = []
    this.cet_tx_sigs.forEach(sig => {
      let sig_data = Buffer.alloc(1)
      sig_data.writeUInt8(sig.length,0)
      cet_sig_data.push(Buffer.concat([ sig_data, sig ]))
    })
    // concat main buffer with cet data and refund sig
    buffer = Buffer.concat([ buffer ].concat(cet_sig_data, this.refund_tx_sig))
    return buffer
  }

  deserialize(data: Buffer) {
    let funding_tx_sigs = []
    let offset = 0
    let proposalId = data.readUInt16LE(offset)
    offset += 2

    // funding sigs
    let num_funding_sigs = data.readUInt8(offset)
    offset += 1
    for (let i=0;i<num_funding_sigs;i++) {
      let num_items_in_sig = data.readUInt8(offset)
      offset += 1
      let sig = []
      for (let i=0;i<num_items_in_sig;i++) {
        let item_len = data.readUInt8(offset)
        offset += 1
        let item = data.slice(offset,offset+item_len)
        offset += item_len
        sig.push(item)
      }
      funding_tx_sigs.push(sig)
    }

    // CET sigs
    let num_cet_sigs = data.readUInt8(offset)
    let cet_tx_sigs = []
    offset += 1
    for (let i=0;i<num_cet_sigs;i++) {
      let item_len = data.readUInt8(offset)
      offset += 1
      let item = data.slice(offset,offset+item_len)
      offset += item_len
      cet_tx_sigs.push(item)
    }

    this.proposalId = proposalId
    this.funding_tx_sigs = funding_tx_sigs
    this.cet_tx_sigs = cet_tx_sigs
    this.refund_tx_sig = data.slice(offset, data.length)
    this.funding_txid = null
    this.cet_txids = []
    this.refund_txid = null
  }


}
