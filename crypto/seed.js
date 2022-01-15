const HDKey = require('hdkey');
const cr = require('crypto');
const bip39 = require('bip39');

module.exports = (crypto) => {
    class seed {

        constructor(mnemonic) {
            let _;

            if (typeof mnemonic == 'string')
                if (mnemonic.indexOf("xpub") == 0 || mnemonic.indexOf("xprv") == 0) {
                    //from extended key
                    this.isXprv = !!(mnemonic.indexOf("xprv") == 0);
                    this.isXpub = !!(mnemonic.indexOf("xpub") == 0);

                    this.masterKey = HDKey.fromExtendedKey(mnemonic);
                    return;
                }

            if (/^[0-9a-f]+$/is.test(mnemonic)) {
                //is seed
                _ = mnemonic;
            } else if (typeof mnemonic == 'string')
                _ = seed.mnemonicToSeed(mnemonic);
            else if (typeof mnemonic == 'object') {
                _ = mnemonic.seed;
            }

            this.masterKey = HDKey.fromMasterSeed(Buffer.from(_, 'hex'))
        }
        getMaster() {
            return this.masterKey;
        }
        derive(path, isHardened) {
            //path m/BIP/network/account/chain/address
            let root = isHardened ? 'm/44/9999/' : "m/44'/9999'/";//todo make constant here.
            let key = this.masterKey.derive(root + path);
            key.path = path;
            return key;
        }
        createPublicKeypair(index, account, isChange) {
            if (!account)
                account = 0;
            return this.derive("" + account + "/" + (isChange ? 1 : 0) + "/" + index, true);
        }
        createKey(index, account, isChange) {
            if (!account)
                account = 0;
            return this.derive("" + account + "'/" + (isChange ? 1 : 0) + "'/" + index);
        }
        tryFind(publicKey, tries) {
            if (!tries)
                tries = 100;

            for (let i = 0; i < tries; i++) {
                let key = this.createKey(i);

                if (key.publicKey.toString('hex') == publicKey)
                    return i;
            }

            return false;
        }
        static getRandomPath(depth) {
            if (!depth)
                depth = 3;

            let arr = [];
            for (let i = 0; i < depth; i++) {
                arr.push(this.randomNumber(0, 0x80000000 - 1))
            }

            return arr.join("/");
        }
        static randomNumber(min, max) {
            // случайное число от min до (max+1)
            let rand = min + Math.random() * (max + 1 - min);
            return Math.floor(rand);
        }
        static createMnemonicPair(lang, sd) {
            let langlist = ['chinese_simplified', 'english', 'japanese', 'spanish', 'italian', 'french', 'korean', 'chinese_traditional']
            if (langlist.indexOf(lang) == -1)
                lang = 'english';
            bip39.setDefaultWordlist(lang);
            if (sd) {
                let type = seed.checkMnemonic(sd);
                if (type == 'seed') {
                    let mn = seed.seedToMnemonic(sd);
                    return { seed: sd, mnemonic: mn }
                } else if (type == 'mnemonic') {
                    let _hex = seed.mnemonicToSeed(sd);
                    return { seed: _hex, mnemonic: sd }
                } else {
                    return sd;
                }

            } else {
                const mnemonic = bip39.generateMnemonic();
                const seed = bip39.mnemonicToSeedSync(mnemonic);
                return { seed, mnemonic }
            }
        }
        static checkMnemonic(mn) {
            if (/^[0-9a-f]+$/is.test(mn)) {
                //is seed
                return 'seed';
            } else if (typeof mn == 'string')
                return 'mnemonic'
            else if (typeof mnemonic == 'object') {
                return 'object';
            }
        }
        static seedToMnemonic(seed) {
            return bip39.entropyToMnemonic(Buffer.from(seed, 'hex'));
        }
        static mnemonicToSeed(mnemonic) {
            return bip39.mnemonicToEntropy(mnemonic);
        }
        static validateMnemonic(mnemonic) {
            return bip39.validateMnemonic(mnemonic);
        }

    }

    return seed;
};