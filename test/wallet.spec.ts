import {
    Wallet,
    genSeed,
    mnemonicToSeed,
    walletFromSeed,
    walletFromBase58
 } from '../wallet';
import assert = require('assert');
import * as bitcoinjs from 'bitcoinjs-lib'

// let seed1 = wallet.genSeed()

describe('Wallet', function() {
    var res = genSeed()
    res.seed.toString('hex')

    describe('#genSeed()', function() {
        it('Seed correct length', function() {
            assert.equal(res.seed.length,64);
        });
    });

    describe('#mnemonicToSeed()', function() {
        it('seed produced same as genSeed()', function() {
            assert.equal(res.seed,mnemonicToSeed(res.mnemonic).toString())
            // same for password = ""
            assert.equal(res.seed,mnemonicToSeed(res.mnemonic,"").toString())
            assert.notEqual(res.seed,mnemonicToSeed(res.mnemonic,"pass").toString())
        });
    });

    var seed = "83b7a7ae63cba62156eecb501885122ca3a52a7fe8cde12e8f35fdfadba057fbb267753e58ec52347dfa3da77a7f6c930ec6f32137964240f91bbd35d3e6fcac"
    let wallet = walletFromSeed(Buffer.from(seed,'hex'),bitcoinjs.networks.bitcoin)
    let addr1 = wallet.newAddress()
    describe('export/import wallet', function() {
        it('base58', function() {
            // rebuild with base58
            let b58 = wallet.exportBase58()
            let wallet2 = walletFromBase58(b58,bitcoinjs.networks.bitcoin)
            let addr2 = wallet2.newAddress()
            assert.equal(addr1,addr2) // compare addresses produced
        });
        it('WIF') // TODO
            let wif = wallet.exportWIF()
            // console.log(wif)
            let ecpair = bitcoinjs.ECPair.fromWIF(wif)
            // console.log(ecpair)
    });

    describe('sigining message with address', function() {
        it('verify(addr, sig) == true', function() {
            let sig = wallet.sign(addr1,"tomos")
            assert(wallet.verify(addr1,"tomos",sig))
        });
    });

    describe('#update_utxos()', function() {
        it('wallet.utxos update with utxo[]', function() {
            assert(!wallet.utxos.length) // ensure empty
            wallet.update_utxos()
            assert.equal(wallet.utxos.length,2) // ensure populated
        });
    });

    describe('#newAddress()', function() {
        it('shouldnt re-use addresses', function() {
            let addrs = wallet.derivedAddresses()
            let addr2 = wallet.newAddress()
            assert(addrs.includes(addr1))
            assert(addrs.includes(addr2))
            assert.notEqual(addr1,addr2)
        });
        it('generate more if limit reached', function() {
            let num_addrs = wallet.addr_depth + 1
            assert.equal(wallet.derivedAddresses().length, num_addrs)
            for (let k = 0; k < num_addrs; ++k) wallet.newAddress();
            assert.equal(wallet.derivedAddresses().length, num_addrs + 5)
        });
    });
});
