/**
  Participant objects contains all data to initialise a DLC_Builder protocol run.
  They can be passed back and forth between participants until agreement is reached.
  And contain:
    - cet_amounts: array of output amount for each case (in same
      order as oracle keys for each case)
    - atleast 3 keys:
      - init_pub_keys[]: public keys to spend utxos to fund contract
      - funding_pub_key: public key to unlock funds from funding tx
      - sweep_pub_key: public key to unlock funds from CETs
    - init_utxos[]: UTXOs to fund DLC contract
    - change_addr: address for change output of funding tx inptus
    - final_output_addr: address of final output (or refund)
    - oracle information:
      - oracle_messages: list of messages representing each outcome of
        contract for oracle to sign
      - oracle_event_id: Oracle-provided ID of event for which messages
        can be the outcome of
    - network: {bitcoin, testnet, regtest}
    - DLC parameters:
      - funding amount for each participant
      - CLTV delay for CET output 0s
      - Refund Locktime (block or unix time after which refund tx is valid)
 */


export interface Input {
  txid: string,
  vout: number,
  prevTxScript: string,
  value: number
}

export class Participant {
  public fund_amount: number
  public cet_amounts: number[]
  public oracle_messages: string[]
  public oracle_event_id: number
  public funding_pub_key: Buffer
  public sweep_pub_key: Buffer
  public init_utxos: Input[]
  public change_amount: number
  public change_addr: string
  public final_output_addr: string
  public cltv_locktime: number
  public refund_locktime: number

  constructor(
    fund_amount?: number,
    cet_amounts?: number[],
    oracle_messages?: string[],
    oracle_event_id?: number,
    funding_pub_key?: Buffer,
    sweep_pub_key?: Buffer,
    init_utxos?: Input[],
    change_amount?: number,
    change_addr?: string,
    final_output_addr?: string,
    cltv_locktime?: number,
    refund_locktime?: number
  ) {
    this.fund_amount = fund_amount
    this.cet_amounts = cet_amounts
    oracle_messages.forEach(msg => {
      if (msg.length > 32) { throw "message "+msg+" too long."}
    })
    this.oracle_messages = oracle_messages
    if (oracle_event_id >= 2**16) { throw "proposal ID must be 16-bit"}
    this.oracle_event_id = oracle_event_id
    this.funding_pub_key = funding_pub_key
    this.sweep_pub_key = sweep_pub_key
    this.init_utxos = init_utxos
    this.change_amount = change_amount
    this.change_addr = change_addr
    this.final_output_addr = final_output_addr
    this.cltv_locktime = cltv_locktime
    this.refund_locktime = refund_locktime
  }

  serialize() {
    // items appended to buffer in order of appearence in class.
    // Unknown sized data preceded by their length
    let buffer = Buffer.allocUnsafe(2+(1+this.cet_amounts.length)*6);
    let offset = 0
    // fund_amount
    offset = buffer.writeUIntLE(this.fund_amount, offset, 6)
    // cet amounts data
    offset = buffer.writeUInt16LE(this.cet_amounts.length, offset)
    this.cet_amounts.forEach(amount => {
      offset = buffer.writeUIntLE(amount, offset, 6)
    })
    // oracle messages
    let msgs_data = []
    this.oracle_messages.forEach(msg => {
      let msg_buff = Buffer.from(msg,'utf-8')
      let msg_data = Buffer.allocUnsafe(1)
      msg_data.writeUInt8(msg_buff.length,0)
      msgs_data.push(Buffer.concat([ msg_data, msg_buff ]))
    })
    buffer = Buffer.concat([ buffer ].concat(msgs_data))
    offset = buffer.length-1
    // oracle_event_id, funding_pub_key, sweep_pub_key
    let temp_buffer = Buffer.allocUnsafe(2);
    temp_buffer.writeUInt16LE(this.oracle_event_id, 0)
    buffer = Buffer.concat([ buffer ].concat(temp_buffer,this.funding_pub_key, this.sweep_pub_key))
    // init_utxos
    let utxos_data = []
    let num_utxos = Buffer.allocUnsafe(1)
    num_utxos.writeUInt8(this.init_utxos.length,0)
    utxos_data.push(num_utxos)
    this.init_utxos.forEach(utxo => {
      let utxo_buff = Buffer.from(JSON.stringify(utxo),'utf-8')
      let utxo_data = Buffer.allocUnsafe(1)
      utxo_data.writeUInt8(utxo_buff.length,0)
      utxos_data.push(Buffer.concat([ utxo_data, utxo_buff ]))
    })
    buffer = Buffer.concat([ buffer ].concat(utxos_data))
    offset = buffer.length-1
    // change_amount,change_addr,final_output_addr,cltv_locktime,refund_locktime
    let change_amount_buffer = Buffer.allocUnsafe(6);
    change_amount_buffer.writeUIntLE(this.change_amount,0, 6)
    let change_addr_buf = Buffer.from(this.change_addr,'utf-8')
    let change_addr_size_buf = Buffer.allocUnsafe(1)
    change_addr_size_buf.writeUInt8(change_addr_buf.length,0)
    let final_addr_buf = Buffer.from(this.final_output_addr,'utf-8')
    let final_addr_size_buf = Buffer.allocUnsafe(1)
    final_addr_size_buf.writeUInt8(final_addr_buf.length,0)
    let cltv_locktime_buf = Buffer.allocUnsafe(6);
    cltv_locktime_buf.writeUIntLE(this.cltv_locktime,0, 6)
    let refund_locktime_buf = Buffer.allocUnsafe(6);
    refund_locktime_buf.writeUIntLE(this.refund_locktime,0, 6)
    buffer = Buffer.concat([ buffer ].concat(
        change_amount_buffer,
        change_addr_size_buf,
        change_addr_buf,
        final_addr_size_buf,
        final_addr_buf,
        cltv_locktime_buf,
        refund_locktime_buf
      ))

    return buffer
  }

  deserialize(data: Buffer) {
    let offset = 0
    this.fund_amount = data.readUIntLE(offset,6)
    offset += 6
    // cet amounts
    let num_cets = data.readUInt16LE(offset)
    offset += 2
    this.cet_amounts = []
    for (let i=0;i<num_cets;i++) {
      this.cet_amounts.push(data.readUIntLE(offset,6))
      offset += 6
    }
    //oracle messages
    this.oracle_messages = []
    for (let i=0;i<num_cets;i++) {
      let msg_len = data.readUInt8(offset)
      offset += 1
      let msg = data.slice(offset,offset+msg_len)
      this.oracle_messages.push(msg.toString())
      offset += msg.length
    }
    // oracle_event_id, funding_pub_key, sweep_pub_key
    this.oracle_event_id = data.readUInt16LE(offset)
    this.funding_pub_key = data.slice(offset+2,offset+35)
    this.sweep_pub_key = data.slice(offset+35,offset+68)
    offset += 68
    // init_utxos
    let num_utxos = data.readUInt8(offset)
    offset+=1
    this.init_utxos = []
    for (let i=0;i<num_utxos;i++) {
      let utxo_len = data.readUInt8(offset)
      offset += 1
      let utxo = data.slice(offset,offset+utxo_len)
      this.init_utxos.push(JSON.parse(utxo.toString()))
      offset += utxo.length
    }
    // change_amount,change_addr,final_output_addr,cltv_locktime,refund_locktime
    this.change_amount = data.readUIntLE(offset,6)
    offset+=6
    let change_addr_len = data.readUInt8(offset)
    offset+=1
    this.change_addr = data.slice(offset,offset+change_addr_len).toString()
    offset+=change_addr_len
    let final_output_addr_len = data.readUInt8(offset)
    offset+=1
    this.final_output_addr = data.slice(offset,offset+final_output_addr_len).toString()
    offset+=final_output_addr_len
    this.cltv_locktime = data.readUIntLE(offset,6)
    offset+=6
    this.refund_locktime = data.readUIntLE(offset,6)
    offset+=6
  }
}
