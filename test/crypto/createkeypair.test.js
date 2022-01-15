const assert = require('assert');
it('should return random keypair', function(done) {

    try {
        const APP = require('../../index');

        let app = new APP(require('../config.json'));

        app.on('init', () => {

            //console.log(app.crypto.seed.createMnemonicPair());
            //5ba32a7cefb54cd289677dbcd4f7889a0f63487c885890740ad7a4ee21d5114eb35c38f02fddcf57eb3c36b4764a2d32854c534a317aca3814a21a4c6fc19add
            app.crypto.createKeyPair('test').then((pair) => {

                    assert(pair.privateKey && pair.publicKey && pair.privateKey.length >= 63 && pair.publicKey.length >= 63);
                    app.storage.rollback()
                        .then(() => {
                            done();
                        })
                })
                .catch(e => {
                    console.log(e);
                })

        });
    } catch (e) {
        console.log(e);
    }


    /*after(function () {
        app.storage.rollback();
        console.log('rollback finished');
    });*/
}).timeout(5000);