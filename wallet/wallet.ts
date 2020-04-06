import * as bitcoinjs from 'bitcoinjs-lib'
import * as bip32utils from 'bip32-utils'
import * as bip32 from 'bip32'; // seed to address
import * as bip39 from 'bip39' // mnemonic

import { MockElectrumServer } from '../mocks/mock-electrum'
var electrum = new MockElectrumServer()

// A wallet is a single BIP32-utils Account.
export class Wallet {
    private root // bip32.BIP32
    private hardened_0
    private external
    private internal
    private account: bip32utils.Account
    public chain: bip32utils.Chain

    public addr_depth: number = 5 // this value generates new addresses.
                                  // generate none.
    private addr_used_index: number = 0 // used up to this index

    public network
    public utxos: any[]

    constructor(network: Object) {
      this.network = network;
      this.utxos = []
    }

    setRoot(root: Object) {
      if (typeof this.root !== 'undefined') { throw "Seed already set for this wallet." }
      this.root = root
      this.root.network = this.network
      this.hardened_0 = this.root.deriveHardened(0)

      this.external = this.hardened_0.derive(0)
      this.internal = this.hardened_0.derive(1)
      this.account = new bip32utils.Account([
        new bip32utils.Chain(this.external.neutered()),
        new bip32utils.Chain(this.internal.neutered())
      ])
      this.chain = new bip32utils.Chain(this.external)
      // Generate a load of addresses to begin with so they can be checked
      // for activity by the electrum server
      for (let k = 0; k < this.addr_depth; ++k) this.chain.next()
    }

    // address
    newAddress() {
        this.addr_used_index += 1
        if (this.addr_used_index == this.addr_depth) {
            // generate more addresses
            for (let k = 0; k < 5; ++k) this.chain.next();
            this.addr_depth += 5
        }
        return this.chain.addresses[this.addr_used_index - 1]
    }
    // return BIP32 object if address in wallet
    bip32Key(addr: string) {
        let index =  this.chain.find(addr)
        if (!index) { return false}
        return this.chain.derive(addr)
    }
    derivedAddresses() {
        return this.chain.addresses
    }
    // request utxo list from server
    update_utxos() {
        let addrs = this.derivedAddresses();
        // for each address
        addrs.forEach((addr: string) => {
            // for each utxo
            electrum.addr_utxos(addr).forEach((utxo: any) => {
                this.utxos.push(utxo)
            });
        });
    }
    // sign/verify by address
    sign(addr: string, msg: any) {
        try {
            msg = Buffer.from(msg, 'utf8')
        } catch { throw "ERROR: Sign() invalid message type, must be of type string or buffer" }
        if (msg instanceof Buffer) {
            let key = this.chain.derive(addr)
            // use correct hash function here
            return key.sign(bitcoinjs.crypto.sha256(msg))
        }
    }
    verify(addr: string, msg: any, sig: any) {
        try {
            msg = Buffer.from(msg, 'utf8')
            sig = Buffer.from(sig, 'utf8')
        } catch { throw "ERROR: verify() invalid message type, msg and sig must be of type string or buffer" }

        let key = this.chain.derive(addr)
        // use correct hash function here
        return key.verify(bitcoinjs.crypto.sha256(msg),sig)
    }

    //export
    exportWIF() {
        return this.root.toWIF()
    }
    exportBase58() {
        return this.root.toBase58()
    }
}

// create wallet functions
export function walletFromSeed(seed: Buffer, network: Object) {
    let root = bip32.fromSeed(seed)
    let wallet =  new Wallet(network)
    wallet.setRoot(root)
    return wallet
}

export function walletFromBase58(base58: string, network: any) {
    let root = bip32.fromBase58(base58, network)
    let wallet =  new Wallet(network)
    wallet.setRoot(root)
    return wallet
}

// wallet creation functions
export function mnemonicToSeed(mnemonic: string, password = null) {
    if (bip39.validateMnemonic(mnemonic)) {
        return bip39.mnemonicToSeedSync(mnemonic, password)
    }
    return null
}

export function genSeed(password = null) {
    let mnemonic = bip39.generateMnemonic() // uses crypto.randomBytes()
    return { mnemonic: mnemonic, seed: mnemonicToSeed(mnemonic, password) }
}
