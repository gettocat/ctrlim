const assert = require('assert');

it('should follow to media @testmedia', function (done) {
    this.timeout(50000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));

    app.on("msg", ({ meta, content, dialog }) => {
        if (meta.version == app.Crypto.MEDIA) {
            const msg = app.schema().read(content);
            console.log('received msg from media @' + meta.from, 'content: <' + msg.typename + '#' + msg.version + '>', msg.content);

            app.storage.rollback()
                .then(() => {
                    done();
                })
        }
    })

    let _xpub;
    app.on('init', () => {
        console.log('inited');
        app.createMedia('testmedia', 'MEDIA_PUBLIC')
            .then((xpub) => {
                _xpub = xpub;
                return app.getMedia('testmedia')
            })
            .then((media_data) => {
                //follow
                //check result
                //return Promise.resolve();
                return app.follow('testmedia')
            })
            .then((media_dialog) => {
                //assert(!app.network.getFollowState('testmedia', media_dialog.localkey));
                return app.sendMediaMessage('testmedia', app.buildMessage('text', '#testmessage#'));
            })
            .then((m) => {
                console.log('sended:', m);
                return new Promise(resolve => {

                })
            })
            .catch(e => {
                console.log(e)
            })


    })

});