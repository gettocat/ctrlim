const assert = require('assert');

it('should follow to media @testmedia', function (done) {
    this.timeout(50000);
    const APP = require('../../index');

    let app = new APP(require('../config.json'));

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
                return app.follow('testmedia')
            })
            .then(() => {


                app.storage.dialogs.map((item) => {
                    return item.externalkey == 'testmedia'
                })
                    .then((found) => {
                        console.log('found key: ', found)
                        assert(app.network.getFollowState('testmedia', found.localkey));
                        app.storage.rollback()
                            .then(() => {
                                done();
                            })
                    })


            })
            .catch(e => {
                console.log(e)
            })


    })

});