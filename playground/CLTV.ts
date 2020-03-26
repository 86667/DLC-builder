import { ECPair, TransactionBuilder, Transaction } from 'bitcoinjs-lib'
import { address, networks, opcodes, payments, script } from 'bitcoinjs-lib'
const network = networks.regtest
const bip65 = require('bip65');

// outline of CLTV transactions in bitcoinjs

function idToHash(txid: string) {
  return Buffer.from(txid, 'hex').reverse();
}
function toOutputScript(addr: any): Buffer {
  return address.toOutputScript(addr, networks.regtest);
}

let alice = ECPair.fromWIF("cVcVHfmx8SGxdkeKbfjkW9g7oFV6JvWXxWPoekmUd9egRN978iEG",network)
let bob = ECPair.fromWIF("cQZHCoVmsMtyskmTBHsUFg43GemZELUeMTNWSS674rNzWUK85f61",network);

const lockTime = bip65.encode({ blocks: 100 })

let redeemScript = script.fromASM(
  `
  OP_IF
  ${script.number.encode(lockTime).toString('hex')}
  OP_CHECKLOCKTIMEVERIFY
  OP_DROP
  OP_ELSE
  ${alice.publicKey.toString('hex')}
  OP_CHECKSIGVERIFY
  OP_ENDIF
  ${bob.publicKey.toString('hex')}
  OP_CHECKSIG
  `
  .trim()
  .replace(/\s+/g, ' '),
);
const p2sh = payments.p2sh({
  redeem: { output: redeemScript, network: networks.regtest },
  network: networks.regtest,
});
console.log(p2sh.address)

// find prevOutScript for p2sh - this is the scriptPubKey for p2sh output
// const fund_txb = new TransactionBuilder(network)
// fund_txb.addOutput(p2sh.address, 999e5)
// let prevOutScript = fund_txb.buildIncomplete().outs[0].script.toString('hex')
// console.log(fund_txb.buildIncomplete().outs[0].script.toString('hex'))

const tx = new Transaction();
tx.locktime = 0;


let hash="2ff3e66cff456e3d504259be3712016809c7c22818e5abc4eba08b6ef9f2760b"
// hash = hash.split("").reverse().join("")
var reverse = require("buffer-reverse")

tx.addInput(reverse(Buffer.from(hash,'hex')),1,0xfffffffe)
tx.addOutput(toOutputScript("bcrt1qv8ahv0hqda039645vuhuy0mf25j9jgrxuxnxzv"), 999e5)

// {Alice's signature} OP_TRUE
const signatureHash = tx.hashForSignature(0, redeemScript, Transaction.SIGHASH_ALL)
const redeemScriptSig = payments.p2sh({
  redeem: {
    input: script.compile([
      script.signature.encode(alice.sign(signatureHash), Transaction.SIGHASH_ALL),
      opcodes.OP_TRUE
    ]),
    output: redeemScript
  }
}).input
tx.setInputScript(0, redeemScriptSig)

console.log('tx.toHex()  ', tx.toHex())

// txid: 2ff3e66cff456e3d504259be3712016809c7c22818e5abc4eba08b6ef9f2760b
// hash: 9c6d2f6545f2051cb505ca57ce1b1681c2155acab3055488f7362402647169e3

// hash as buffer
// e3697164022436f7885405b3ca5a15c281161bce57ca05b51c05f245652f6d9c

// function testSignInput(scriptPubKey: string, key) {
//   let psbt = new Psbt()
//   psbt.addInput({"hash": "add461158f90a33b28e6a8d8a1219064f413e2604a4179ec7d33c61b9b672a90","index": 0,
//     "witnessUtxo": {"script": Buffer.from(scriptPubKey, 'hex'),
//     "value": 200000000}})
//   return(psbt.signInput(0,key))
