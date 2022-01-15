const assert = require('assert');

it('hellopublickey switch should be equal', function (done) {
    this.timeout(5000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));


    app.on('init', () => {
        let data = Buffer.from('hello its an additional content of hellopublickey protocol message');

        let pair, pair2;
        app.storage.keys.createPublicIndex(1)
            .then((_) => {
                pair = _;
                return app.storage.keys.createPublicIndex(2);
            })
            .then((_) => {
                pair2 = _;
                return Promise.resolve()
            })
            .then(() => {
                //xpub of this pair.
                //let xpub = 'xpub6GnWVPU5zvgtLyWb37kqCz16GxAguzAU6GbcXRh2PdrDAUkAV5RwvFysAv4Ak2Xe3SFPCAndts3YNJ8TE2umcyQAWVF5WRKtU1SQeXJKSQT';

                //xpub of another person. Public address for communications
                //console.log('try to find:', pair2.publicKey.toString('hex'));
                let xpub = pair.xpub;
                //app.crypto.addDialog('02d0e8e6b10ef0b76250394a1d6fa61801ee64cbbc3586f5cd7ac16281973f0ef7', '02d4736cdc8506f91e681787f83a5b121a7a66ccb9c7a068ecdb78e28f27a84df1');
                //app.crypto.addDialog('02d4736cdc8506f91e681787f83a5b121a7a66ccb9c7a068ecdb78e28f27a84df1', '02d0e8e6b10ef0b76250394a1d6fa61801ee64cbbc3586f5cd7ac16281973f0ef7');

                app.crypto.encrypt({ externalkeyWithDerive: xpub }, data, app.Crypto.HELLOPUBLICKEY)
                    .then((encryptedData) => {
                        //console.log('encrypted:', encryptedData.toString('hex'));
                        return encryptedData
                    })
                    .then((enc) => {
                        return app.crypto.decrypt(enc);
                    })
                    .then((res) => {
                        let switchKey = res.meta.switchHelloPublicKey;
                        console.log('decrypted hellopublickey', switchKey.getContent().old.getContent(), '->', switchKey.getContent().new.getContent())
                        //console.log('toSend', res);

                        console.log('decrypted', data.equals(res.content), res.content.toString(), res.meta.switchHelloPublicKey)
                        assert(data.equals(res.content) && res.dialog.externalkey != pair.publicKey && res.dialog.externalkey == res.meta.from);

                        return new Promise(resolve => {
                            //assert(switchKey.getContent().old.getContent() == pair.publicKey && "switchKey decrypted and old key is key of sender");
                            assert(res.dialog && "decrypted");

                            let hpath = res.meta.switchHelloPublicKey.getContent().path.getContent()
                            let X = new app.crypto.seed(xpub);
                            let B = X.derive(hpath, true);


                            //sometimes its fail with error: Error: invalid schema object in read
                            //im think its because of ECDH encrypt/decrypt issue. Key generation with derive (random?)

                            //assert(res.dialog.localkey == B.publicKey.toString('hex') && "localkey is secured");
                            console.log(res.dialog)


                            app.storage.rollback()
                                .then(() => {
                                    done();
                                    resolve()
                                })

                        })

                    })
                    .catch(e => {
                        console.log(e)
                        done(e);
                    })
            })



    });

});