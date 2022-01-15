const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

class TestEvent extends EventEmitter {
    constructor() {
        super();
    }
}

let follower;
let evt = new TestEvent();

it('should follow to media @testmedia', function (done) {
    this.timeout(50000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));

    app.on("follower", (media, followerKey, followerRow) => {
        console.log('3. new follower', media, followerKey, followerRow);


        follower = followerKey;
        evt.on('received', () => {
            console.log('6. message from media received');
            app.storage.rollback()
                .then(() => {
                    done();
                })
        });

        app.sendMediaMessage('testmedia_private', app.buildMessage('text', '#testmessage#'))
            .then((messages) => {
                console.log('4. sended to followers', messages)
            })
    })

    app.on("msg", ({ meta, content, dialog }) => {
        if (dialog.localkey == follower) {
            const msg = app.schema().read(content);
            console.log('5. received msg from media @' + meta.from, 'content: <' + msg.typename + '#' + msg.version + '>', msg.content);
            evt.emit('received', content);
        }
    })

    let _xpub, _md;
    app.on('init', () => {
        console.log('1. inited');
        app.createMedia('testmedia_private', 'MEDIA_PRIVATE')
            .then((xpub) => {
                _xpub = xpub;
                return app.getMedia('testmedia_private')
            })
            .then((media_data) => {
                //follow
                //check result
                _md = media_data;
                console.log('2. media', media_data)
                return app.follow('testmedia_private')
            })
            .then(() => {
                return app.storage.models.Dialog.findOne({ where: { externalkey: _md.publicKey } })
            })
            .then((dialog) => {
                console.log('follow info:', {
                    localkey: dialog.localkey,
                    externalkey: dialog.externalkey
                })
            })
            .catch(e => {
                console.log(e)
            })


    });

    after(function () {
        console.log('rollback.');
        app.storage.rollback();

    })

});