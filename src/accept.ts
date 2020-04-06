// Accept object is used to send/receive signature information.
// It is constructed and sent to the other participant. Other participants
// Accept object is received and their signatures included in all transactions
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
