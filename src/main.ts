import * as bitcoinjs from 'bitcoinjs-lib'
import { Proposal } from './proposal'

let wif = "KxkkxqxhmKq94nK2ow47MxD9LYJcYi2WhnaXL1pjzTyYvZPuPFCX"
let key = bitcoinjs.ECPair.fromWIF(wif)

// Alice construct initial proposal:
// A -> B = 10 BTC
// B -> A = 1 BTC
let alice_addr = "3BhWnSpiAPLYJxeMPGBXRQvuDrYcmTqYMd"
let bob_addr = "3DPNFXGoe8QGiEXEApQ3QtHb8wM15VCQU3"

let proposal = new Proposal()
let inputsA = [{"hash":"3ff2163d3d1f75643c2b26c163722bb66a0f22e28c86cecff694c03f6d0ddbe5","index":0}]
let outputsA = [{"address":bob_addr,"value":10}]
proposal.addAlice({"currency":"BTC","amount":10,"inputs":inputsA,"outputs":outputsA})

let inputsB = [{"hash":"d1f75643c2b26c163722b3ff2163d3b66a0f22e28c86cecff694c03f6d0ddbe5","index":0}]
let outputsB = [{"address":alice_addr,"value":1}]
proposal.addBob({"currency":"BTC","amount":1,"inputs":inputsB,"outputs":outputsB})

console.log(proposal.buildTxAlice())
console.log(proposal.buildTxBob())
