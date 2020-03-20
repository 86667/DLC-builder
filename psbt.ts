import { payments, Psbt, ECPair, networks } from 'bitcoinjs-lib'
import * as bip32 from 'bip32'

// outline of ptsb transaction in bitcoinjs


// witnessUTXO: scriptPubkey and value
// may require:
//   redeemScript: A Buffer of the redeemScript for P2SH
//   witnessScript: A Buffer of the witnessScript for P2WSH
let inputs = [{"hash": "add461158f90a33b28e6a8d8a1219064f413e2604a4179ec7d33c61b9b672a90","index": 0,
  "witnessUtxo": {"script": Buffer.from('00148bbc95d2709c71607c60ee3f097c1217482f518d', 'hex'),
  "value": 200000000
}}]
let outputs = [{"address": "1KRMKfeZcmosxALVYESdPNez1AP1mEtywp","value": 149990000},
          {"address": "1KRMKfeZcmosxALVYESdPNez1AP1mEtywp","value": 100000000}]

const psbt = new Psbt()
psbt.setVersion(1);
psbt.setLocktime(0);

// inputs
inputs.forEach(input => {
  psbt.addInput(input);
});
//outputs
outputs.forEach(output => {
  psbt.addOutput(output);
})
console.log(psbt)

let key = ECPair.fromWIF(
  'L2uPYXe17xSTqbCjZvL2DsyXPCbXspvcu5mHLDYUgzdUbZGSKrSr',
);
const { address } = payments.p2wpkh({ pubkey: key.publicKey, network: networks.regtest });
console.log(address)

psbt.signInput(0, key);
// psbt.signInput(1, key);
console.log(psbt.validateSignaturesOfInput(0));
psbt.finalizeAllInputs();

console.log(psbt)

// if segwit use witnessUtxo
// can tell by whether an input has "witness". Or if 5th bytes in raw hex is 00
