import {
  genPrivKey,
  getPubKey,
  newR,
  signMsg
 } from './schnorr'

export class Oracle {
  priv_key = genPrivKey()
  public pub_key = getPubKey(this.priv_key)
  Rs = [] // list of R values published
  ks = [] // list of k values used for each R

  // generate new R,k pair representing a new event. return ID of event (=index in array)
  newEvent() {
    const [ R,k ] = newR()
    this.Rs.push(R)
    this.ks.push(k)
    console.log("Oracle: New R value generated. ID: "+this.Rs.length)
    return this.Rs.length - 1
  }

  getR(id: number) {
    return this.Rs[id]
  }

  signMsg(event_id: number, m: string) {
    return signMsg(this.Rs[event_id],this.ks[event_id],this.priv_key,m)
  }
}
