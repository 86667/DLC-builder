import { ECPair, TransactionBuilder, Transaction } from 'bitcoinjs-lib'
import { networks, opcodes, payments, script } from 'bitcoinjs-lib'
const network = networks.regtest
const bip65 = require('bip65');

// outline of CLTV transactions in bitcoinjs
const hashType = Transaction.SIGHASH_ALL
let alice_sweep = ECPair.fromWIF("cRPM3yaCmyXVKJuuT9mR6Gfji9Lh8LoUMnHcKfyEYFvaMmAqPRGJ",network)
let bob_sweep = ECPair.fromWIF("cVFMT5nYv73PxGHcFgh28UkGZc1vYa388wuBW2KqA8357ebC8qX3",network)
const p2wpkhAlice1 = payments.p2wpkh({pubkey: alice_sweep.publicKey, network})

function cltvCheckSigOutput (aQ, bQ, lockTime) {
  return script.compile([
    opcodes.OP_IF,
    script.number.encode(lockTime),
    opcodes.OP_CHECKLOCKTIMEVERIFY,
    opcodes.OP_DROP,

    opcodes.OP_ELSE,
    bQ.publicKey,
    opcodes.OP_CHECKSIGVERIFY,
    opcodes.OP_ENDIF,

    aQ.publicKey,
    opcodes.OP_CHECKSIG
  ])
}
function cltvCheckSigOutput2 (aQ, bQ, lockTime) {
  return script.compile([
    opcodes.OP_IF,
    script.number.encode(lockTime),
    opcodes.OP_CHECKLOCKTIMEVERIFY,
    opcodes.OP_DROP,
    bQ.publicKey,
    opcodes.OP_CHECKSIG,

    opcodes.OP_ELSE,
    aQ.publicKey,
    opcodes.OP_CHECKSIG,
    opcodes.OP_ENDIF
  ])
}

const locktime = bip65.encode({blocks: 100})
// const locktime = 130
const witnessScript = cltvCheckSigOutput2(alice_sweep, bob_sweep, locktime)
const p2wsh = payments.p2wsh({redeem: {output: witnessScript, network}, network})
console.log('P2WSH address:')
console.log(p2wsh.address)


const txb = new TransactionBuilder(network)
txb.setLockTime(99)
txb.addInput('1923342ea366e6e957a082a08f931a896e26f86f82698a7c6ea4059b8db393aa', 0, 0xfffffffe)
txb.addOutput(p2wpkhAlice1.address, 999e5)
const tx = txb.buildIncomplete()


// add witness
const signatureHash = tx.hashForWitnessV0(0, witnessScript, 1e8, hashType)

const witnessStackFirstBranch = payments.p2wsh({
  redeem: {
    input: script.compile([
      script.signature.encode(alice_sweep.sign(signatureHash), hashType),
      opcodes.OP_FALSE
    ]),
    output: witnessScript
  }
}).witness

const witnessStackSecondBranch = payments.p2wsh({
  redeem: {
    input: script.compile([
      script.signature.encode(bob_sweep.sign(signatureHash), hashType),
      opcodes.OP_TRUE
    ]),
    output: witnessScript
  }
}).witness

tx.setWitness(0, witnessStackSecondBranch)
console.log(tx.toHex())
