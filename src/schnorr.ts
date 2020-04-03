import * as BigInteger from 'bigi'
import * as ecurve from 'ecurve'
import { Buffer } from 'safe-buffer'
import { sha256 } from 'js-sha256';

const curve = ecurve.getCurveByName('secp256k1');
const G = curve.G;
const n = curve.n;

// Schnorr tools for DLC Oracle signing

export function genPrivKey() {
  return BigInteger.fromHex(randHex())
}
export function getPubKey(a: BigInteger) {
  return G.multiply(a)
}
// return DLC oracle pubkey (P,R) and corresponding k value for this event
export function newR() {
  // TODO: secure random number generator
  const k = BigInteger.fromHex(randHex())
  const R = G.multiply(k)
  return [ R , k ]
}
// find public sG values for each message from Oracles published (R,P)
export function getPubs(R: any, P: any, msgs: string[]) {
  let buffer_msgs = msgs.map(m => Buffer.from(m))
  const Rx = intToBuffer(R.affineX)
  let sG = []
  buffer_msgs.forEach(msg => {
    // e = h(R, P, m)
    const e = bufferToInt(hash(Buffer.concat([Rx, pointToBuffer(P), msg]))).mod(n);
    const eP = P.multiply(e)
    // sG = R + eP
    sG.push(R.add(eP))
  })
  return sG
}

export function signMsg(R: any, k: any, a: BigInteger, m: string) {
  const P = G.multiply(a);
  // e = h(R, P, m)
  const Rx = intToBuffer(R.affineX);
  const e = bufferToInt(hash(Buffer.concat([Rx, pointToBuffer(P), Buffer.from(m)]))).mod(n);
  const ea = a.multiply(e)
  // s = k = ea
  return k.add(ea).mod(n)
}
// for testing
export function s_to_sG(s: any) {
  return G.multiply(s)
}

function randHex() {
  let rand = (Math.random()*1e18).toString(16)
  if (rand.length % 2 != 0) { return rand.concat("1") }
  return rand
}

function bufferToInt(buffer: Buffer) {
  return BigInteger.fromBuffer(buffer);
}
function intToBuffer(bigInteger: BigInteger) {
  return bigInteger.toBuffer(32);
}
function hash(buffer) {
  return Buffer.from(sha256.create().update(buffer).array());
}
function pointToBuffer(point) {
  return point.getEncoded(true);
}
