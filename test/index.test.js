function importTest(name, path) {
    describe(name, function() {
        require(path);
    });
}

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

//let common = require("./common");

describe("top", function() {
    beforeEach(function() {
        //console.log("running something before each test");
    });

    //@personal
    importTest("crypto/createKeyPair", './crypto/createkeypair.test.js');
    importTest("crypto/encrypt|decrypt", './crypto/encrypt-decrypt.test');
    importTest("cannot-decrypt", './crypto/cannot-decrypt.test');

    //tempkey
    importTest("tempkey-crypto/decrypt", './crypto/temp-key.test');

    //hellopublickey
    importTest("hellopublickey", './crypto/hellopublickey.test.js');

    //filter-filter
    importTest("filterfrom-filterto", './crypto/filterfrom-filterto.test.js');
    //filterfrom
    importTest("filterfrom", './crypto/filterfrom-keyto.test.js');
    //key-to
    importTest("filterto", './crypto/keyfrom-filterto.test.js');
    //key-key
    importTest("keyfrom-keyto", './crypto/keyfrom-keyto.test.js');

    //errors
    //dialog not found (if have valid key)

    //@media
    //open media:
    //creation
    importTest("openmedia create", './media/creation.open.test.js');
    //follow
    importTest("openmedia follow", './media/follow_open.test.js');
    //unfollow
    importTest("openmedia unfollow", './media/unfollow_open.test.js');
    //message from media
    importTest("openmedia broadcast", './media/media_broadcast.test.js');

    //closed media:
    //creation
    importTest("closed media create", './media/creation.close.test.js');
    //follow
    importTest("closed media follow", './media/follow_close.test.js');
    //unfollow
    importTest("closed media unfollow", './media/unfollow_close.test.js');
    //message from media
    importTest("closed media broadcast", './media/unfollow_close.test.js');


    after(function() {
        console.log("after all tests");
    });
});