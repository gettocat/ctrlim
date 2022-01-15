const assert = require('assert');

it('should follow to media @testmedia', function (done) {
    this.timeout(50000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));

    app.on("follower", (media, followerKey, followerRow) => {

        //unfollow
        console.log('followed');
        app.unfollow('testmedia')

    })

    app.on('notfollower', (media, followerKey) => {
        console.log('notfollower', media, followerKey);
        done();
        app.storage.rollback()
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
                return app.follow('testmedia')
            })
            .then((media_dialog) => {
                console.log(media_dialog)
                //assert(app.network.getFollowState('testmedia', media_dialog.localkey));
                //done();
            })
            .catch(e => {
                console.log(e)
            })


    })

});