const assert = require('assert');

it('should create new media @testmedia', function (done) {
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
                console.log('created', media_data)
                assert(media_data.xpub);
                app.storage.rollback()
                    .then(() => {
                        done();
                    })
            })
            .catch(e => {
                console.log(e)
            })


    })

});