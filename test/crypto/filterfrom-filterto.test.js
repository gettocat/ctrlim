const assert = require('assert');

it('should be equal', function(done) {
    this.timeout(5000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));


    app.on('init', () => {

        let seed = new app.crypto.seed("skull fan flight acid grunt adjust steak process flight drastic hope silly");
        let key1 = seed.createKey(4);
        let key2 = seed.createKey(5);
        let pair = {
            publicKey: key1.publicKey.toString('hex'),
            privateKey: key1.privateKey.toString('hex')
        };

        let pair2 = {
            publicKey: key2.publicKey.toString('hex'),
            privateKey: key2.privateKey.toString('hex')
        };


        let data = Buffer.from('hello');
        Promise.all([
                app.crypto.addDialog(pair.publicKey, pair2.publicKey),
                app.crypto.addDialog(pair2.publicKey, pair.publicKey)
            ])
            .then(() => {
                return app.crypto.encrypt({ localkey: pair.publicKey, externalkey: pair2.publicKey }, data, app.Crypto.FILTERFROMFILTERTO)
            })
            .then((encryptedData) => {
                console.log('encrypted:', encryptedData.toString('hex'));
                return encryptedData
            })
            .then((enc) => {
                return app.crypto.decrypt(enc);
            })
            .then((res) => {
                console.log('decrypted', data.equals(res.content), res.content.toString())
                assert(data.equals(res.content));
                app.storage.rollback()
                    .then(() => {
                        done();
                    })
            })
            .catch(e => {
                console.log(e)
                done(e);
            })

    });

});