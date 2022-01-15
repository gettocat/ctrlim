const assert = require('assert');

it('tempkey switch should be equal', function (done) {
    this.timeout(7000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));


    app.on('init', () => {

        let seed = new app.crypto.seed("skull fan flight acid grunt adjust steak process flight drastic hope silly");
        let key1 = seed.createKey(40);
        let key2 = seed.createKey(50);
        let pair = {
            publicKey: key1.publicKey.toString('hex'),
            privateKey: key1.privateKey.toString('hex')
        };

        let pair2 = {
            publicKey: key2.publicKey.toString('hex'),
            privateKey: key2.privateKey.toString('hex')
        };


        let data = Buffer.from('hello 123');
        Promise.all([
            app.crypto.addDialog(pair.publicKey, pair2.publicKey),
            app.crypto.addDialog(pair2.publicKey, pair.publicKey),
            app.crypto.importKeys([40, 50]),
        ])
            .then(() => {
                return app.crypto.encrypt({ localkey: pair.publicKey, externalkey: pair2.publicKey }, data, app.Crypto.TEMPKEY)
            })
            .then((encryptedData) => {
                console.log('encrypted:', encryptedData.toString('hex'), 'for', pair.publicKey, '->', pair2.publicKey);
                return encryptedData
            })
            .then((enc) => {
                return app.crypto.decrypt(enc);
            })
            .then((res) => {


                assert(data.equals(res.content) && res.dialog.externalkey != pair.publicKey && res.dialog.externalkey == res.meta.from);

                console.log(res);
                //let switchKey = app.crypto.schema.read(res.raw, 0).result;
                //console.log('decrypted switch', switchKey.getContent().old.getContent(), '->', switchKey.getContent().new.getContent())
                //console.log('decrypted additional data:', res.content.toString());
                Promise.all([
                    app.crypto.removeDialog(res.meta.switch.getContent().new.getContent(), pair2.publicKey),
                    app.crypto.removeDialog(pair2.publicKey, res.meta.switch.getContent().new.getContent()),
                ])
                    .then(() => {
                        done();
                    })
                //assert(data.equals(res.content));
            })
            .catch(e => {
                console.log(e)
                done(e);
            })

    });

});

/*after(function () {
    app.storage.rollback();
    console.log('rollback finished');
});*/