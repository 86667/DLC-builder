import { Psbt } from 'bitcoinjs-lib'

interface input {
  hash: string,
  index: number
}
interface output {
  address: string,
  value: number
}

interface Participant {
  currency: string,
  amount: number,
  inputs: input[],
  outputs: output[]
}

// A initites proposal and sets Alice's items
// B agrees and sets Bobs items
// OR disagrees and sets Alice and Bobs items as counter-proposal
export class Proposal {
  alice: Participant
  bob: Participant

  addAlice(alice: Participant) {
    this.alice = alice
  }
  addBob(bob: Participant) {
    this.bob = bob
  }

  buildTxAlice() {
    const psbt = new Psbt()
    psbt.setVersion(1);
    psbt.setLocktime(0);

    // inputs
    this.alice.inputs.forEach(input => {
      psbt.addInput(input);
    });
    //output
    this.bob.outputs.forEach(output => {
      psbt.addOutput(output);
    })
    return psbt
  }
  buildTxBob() {
    const psbt = new Psbt()
    psbt.setVersion(1);
    psbt.setLocktime(0);

    // inputs
    this.bob.inputs.forEach(input => {
      psbt.addInput(input);
    });
    //output
    this.alice.outputs.forEach(output => {
      psbt.addOutput(output);
    })
    return psbt
  }
}
