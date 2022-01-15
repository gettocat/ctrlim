const assert = require('assert');

it('should follow to media @testmedia', function (done) {
    this.timeout(50000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));

    let _xpub, _media_dialog;
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
                return app.follow('testmedia')
            })
            .then(() => {
                return app.storage.dialogs.getFollowerKey('testmedia');
            })
            .then((media_dialog) => {
                _media_dialog = media_dialog;
                assert(_media_dialog)
                assert(app.network.getFollowState('testmedia', media_dialog.localkey));
                return app.unfollow('testmedia')
            })
            .then(() => {
                assert(!app.network.getFollowState('testmedia', _media_dialog.localkey));

                return app.storage.rollback();
            })
            .then(() => {
                done()
            })
            .catch(e => {
                console.log(e)
            })


    })

});