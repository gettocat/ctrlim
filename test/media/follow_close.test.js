const assert = require('assert');

it('should follow to media @testmedia', function (done) {
    this.timeout(50000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));

    app.on("follower", (media, followerKey, followerRow) => {
        //

        app.storage.rollback()
            .then(() => {
                done();
            })
        console.log('event follower', media, followerKey, followerRow)
    })

    app.on("testmedia:follower", (followerKey, followerRow) => {
        //add it to db

        console.log('event testmedia:follower', followerKey, followerRow)
    })

    let _xpub;
    app.on('init', () => {
        console.log('inited');
        app.createMedia('testmedia', 'MEDIA_PRIVATE')
            .then((xpub) => {
                _xpub = xpub;
                return app.getMedia('testmedia')
            })
            .then((media_data) => {
                //follow
                //check result
                console.log('media', media_data)
                return app.follow('testmedia')
            })
            .then((media_dialog) => {
                console.log('follow hash', media_dialog)
                //assert(app.network.getFollowState('testmedia', media_dialog.localkey));
            })
            .catch(e => {
                console.log(e)
            })


    })

});