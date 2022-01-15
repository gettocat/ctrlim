const EventEmitter = require('events');
const mixin = require('mixin-deep');
const fs = require('fs');

class App extends EventEmitter {
    constructor(options, password) {
        super();

        if (password) {
            let key = this.crypto.sha256d(password);
            //if we use password field:
            //generate seed by password + use this password in db secret.
            options.seed = seed.createMnemonicPair('english', this.crypto.seed.createMnemonicPair('english', key));
            options.db.secret = password;
        }

        if (!options)
            options = {};

        this.config = this.initConfig(options);

        if (!this.config.seed && this.config.db.secret) {
            throw new Error('Secret must be entered. config.db.secret and config.seed');
        }

        this.testmod = !!this.config.testmod;
        this.testnetenabled = !!this.config.testnetenabled;
        this.SCHEMA = 1;

        if (!this.config.nopersistent && !this.config.nopersist)
            this.setPersistent();

        this.loadModules([
            ['crypto'],
            ['storage', [this.config.seed || null]],
            ['network'],
            ['pow']
        ])
            .then(() => {

                this.emit("init");
            })
    }
    getDefaultConfig() {
        return {
            "testmod": false,
            "db": {
                "secret": ""
            },
            "seed": "",
            "nopersist": false,
            "network": {
                "version": 1,
                "nodiscovery": false,
                "bootstrapnodes": [],//bootstrap nodes.
                "lookup": true, // find & connect to peers if it is not server
                "announce": true // optional- announce self as a connection target
            }
        }
    }
    initConfig(config) {
        return mixin(this.getDefaultConfig(), config);
    }
    getLocalHomePath(appname) {
        let homepath;
        if (process.platform == 'win32')
            homepath = process.env.APPDATA || process.env.USERPROFILE;
        else
            homepath = process.env.HOME;

        let dir = homepath + "/" + (process.platform == 'linux' ? "." : "") + appname;
        this.initDir(dir);
        return dir;
    }
    initDir(path) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }
    //TODO:
    exportDialogs() {
        //get all keys
        //get all dialogs
        //get all own media
        //save to file
        //encrypt with password.
    }
    //TODO:
    importDialogs() {
        //decrypt file with password,
        //load keys
        //load dialogs
        //load medias

    }
    loadModule(m) {
        let params = [],
            mod;
        if (typeof m == 'string')
            mod = m;

        if (m instanceof Array) {
            params = m[1];
            mod = m[0];
        } else {
            mod = m;
        }

        let cls = require("./" + mod + "/index");
        try {
            let cls_obj = cls(this);
            this[mod] = new cls_obj();
            this[this[mod].constructor.name] = cls_obj;
        } catch (e) {
            this[mod] = new cls(this);
            this[this[mod].constructor.name] = cls;
        }
        return this[mod]['init'].apply(this[mod], params);
    }
    loadModules(list) {
        let q = Promise.resolve();
        for (let i in list) {
            q = q.then(() => {
                return this.loadModule(list[i]);
            })
        }

        return q;
    }
    //config
    debug(module_name, level, text) {

        var arr = [];
        for (var i in arguments) {
            if (i < 2)
                continue
            arr.push(arguments[i]);
        }

        this.emit("app.debug", {
            level: level,
            module: module_name,
            text: arr,
        });
    }
    addContact(localkey, externalkey, dialog_title) {
        return this.crypto.addDialog(localkey, externalkey, dialog_title);
    }
    //its used for filterfrom,filterto, filterfrom-filterto messages
    sendById(dialog_id, buffer) {
        //find dialog by id, encrypt, send
        return this.crypto.sendById(dialog_id, buffer)
    }
    send(keyfrom, keyto, dialog_name, buffer, type) {
        if (!type)
            type = this.Crypto.KEYFROMKEYTO;
        return this.crypto.addDialog(keyfrom, keyto, dialog_name)
            .then((dialog) => {
                return this.crypto.encrypt(dialog, buffer, type);
            })
            .then(payload => {
                return this.crypto.payloadBroadcast(payload)
            })
    }
    schema(name) {
        if (name) {
            return this.crypto.messageSchema[name];
        }
        return this.crypto.messageSchema;
    }
    saveMessage(dialog_id, content, options) {
        //calculate type
        const type = this.schema().getType(content);
        const cnt = this.schema().readJSON(content);
        const data = this.schema().getContent(content);

        return this.storage.messages.add(dialog_id, options.message_id, data, options.self, type, JSON.stringify(cnt), options.nonce, options.time, options.hash)
    }
    createEmptyKey() {
        return this.storage.keys.createEmpty();
    }
    createEmptyMediaKey() {
        return this.storage.keys.createPublicEmpty();
    }
    //media
    createMedia(name, type) {
        //type can be:
        //MEDIA_OPEN - list of followers with publickeys of followers open in network
        //MEDIA_CLOSED - list of followers in localstore of media node

        if (!name)
            throw new Error('Invalid name');

        //check name in media db for double
        if (this.network.hasState(name))
            throw new Error('nickname ' + name + ' already exist in network');

        return this.crypto.createMedia(name, type);
    }
    editMedia(xpub, options) {
        //TODO
    }
    getMedia(media_name) {
        let media_data = this.network.getState(media_name);

        if (!media_name || !media_data || !media_data.xpub)
            return false;

        return media_data;
    }
    follow(media_name) {
        return this.crypto.follow(media_name)
    }
    unfollow(media_name) {
        return this.crypto.unfollow(media_name)
    }
    sendMediaMessage(media_name, msg) {
        return this.crypto.mediaBroadcast(media_name, msg);
    }
    setPersistent() {
        //do something when app is closing
        process.on('exit', this.exitHandler.bind(this, { cleanup: true }));

        //catches ctrl+c event
        process.on('SIGINT', this.exitHandler.bind(this, { cleanup: true, exit: true }));

        // catches "kill pid" (for example: nodemon restart)
        process.on('SIGUSR1', this.exitHandler.bind(this, { exit: true }));
        process.on('SIGUSR2', this.exitHandler.bind(this, { exit: true }));

        //catches uncaught exceptions
        process.on('uncaughtException', (e) => {
            this.exitHandler.bind(this, { exit: false, exception: true, e })
        });
    }
    //services
    exitHandler(options, exitCode) {
        if (options.cleanup) {
            let promises = [];

            if (!options.exception) {
                new Promise(resolve => {

                    this.on("module.destroy", (m) => {
                        promises.push(m.promise);
                        if (promises.length == 2)
                            Promise.all(promises).then(() => {
                                resolve();
                            })
                    })

                }).then(() => {
                    this.destroy();
                })


                this.emit("beforeDestroy");
            }

        }
        if (exitCode || exitCode === 0) console.log(exitCode);
        if (options.exception) {
            console.log(options);
        }
        if (options.exit) process.exit();
    }
    destroy() {
        this.debug('common', 'info', 'app destroyed correctly');
    }
}

module.exports = App;


// media manage by followers:
// https://habr.com/ru/post/456424/ for storing proofs
//TODO: MESSAGE_GROUP BY schnorr signatures https://npm.io/package/bip-schnorr