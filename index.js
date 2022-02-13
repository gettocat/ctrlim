const EventEmitter = require('events');
const mixin = require('mixin-deep');
const fs = require('fs');
const cr = require('crypto');

class App extends EventEmitter {
    constructor(options, password) {
        super();

        if (!options)
            options = {};

        //this.on('wrongpassword', () => {
        //    do something if password is wrong
        //})

        if (password) {
            let key = cr.createHash('sha256').update(cr.createHash('sha256').update(password).digest()).digest('hex');
            //if we use password field:
            //generate seed by password + use this password in db secret.
            let seed = require('./crypto/seed');
            options.seed = seed().createMnemonicPair('english', key).mnemonic;

            if (!options.db)
                options.db = {};

            options.db.secret = password;
        }

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
            .catch(e => {
                this.debug('common', 'error', 'main catch', e);
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
                "port": null,
                "key": "ctrlim",
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
    sync() {

        let promise = Promise.resolve();
        let list = this.network.getMempool();
        for (let tx of list) {
            promise = promise.then(() => {
                return new Promise(resolve => {
                    let callback = function () {
                        resolve();
                    };
                    this.crypto.incomingmessagehandle({ message: tx, hash: tx.hash, callback });
                })
            })
        }

        return promise
            .then(() => {
                return this.getMyMedia()
            })
            .then((list) => {

                let prms = [];

                for (let media of list) {
                    let data = this.getMedia(media.name);
                    if (!data || !data.xpub) {
                        prms.push(media.destroy());
                    }
                }

                return Promise.all(prms);

            })
            .then(() => {
                return this.getMyNickname()
            })
            .then((list) => {

                let prms = [];

                for (let nick of list) {
                    let data = this.getMedia(nick.name);
                    if (!data || !data.xpub) {
                        prms.push(nick.destroy());
                    }
                }

                return Promise.all(prms);

            })

    }

    export(file) {
        const algorithm = 'aes-256-ctr';
        const iv = cr.randomBytes(16);
        const secret = cr.createHash('sha256').update(cr.createHash('sha256').update(this.config.db.secret).digest()).digest();
        let stats = {
            keys: 0,
            media: 0,
            dialogs: 0,
            followers: 0
        }

        function encrypt(text) {
            let cipher = cr.createCipheriv(algorithm, secret, iv);
            let encrypted = cipher.update(text);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            return Buffer.concat([iv, encrypted]);
        }

        let keys = [], dialogs = [], medias = [], followers = [];
        return this.storage.keys.mapAll((key) => {
            keys.push(key.toJSON());
            stats.keys++;
            return false;
        })
            .then(() => {
                return this.storage.dialogs.mapAll((dialog) => {
                    dialogs.push(dialog.toJSON());
                    stats.dialogs++;
                    return false;
                });
            })
            .then(() => {
                return this.storage.medias.mapAll((media) => {
                    medias.push(media.toJSON());
                    stats.media++;
                    return false;
                });
            })
            .then(() => {
                return this.storage.followers.mapAll((follower) => {
                    followers.push(follower.toJSON());
                    stats.followers++;
                    return false;
                });
            })
            .then(() => {

                return new Promise((resolve, reject) => {

                    let encryptedBuffer = encrypt(Buffer.from(JSON.stringify({
                        keys,
                        dialogs,
                        medias,
                        followers

                    })));

                    fs.writeFile(file, encryptedBuffer, (err, res) => {
                        if (err)
                            return reject(err);
                        resolve(stats)
                    });

                })


            })
    }
    //TODO:
    import(file, password) {
        //decrypt file with password,
        //load keys
        //load dialogs
        //load medias
        let content = fs.readFileSync(file);
        let json = JSON.parse(decrypt(content));

        let promise = Promise.resolve();

        let stats = {
            keys: 0,
            media: 0,
            dialogs: 0,
            followers: 0
        }

        for (let key of json.keys) {
            if (key.id)
                delete key.id;

            promise = promise.then(() => {

                return this.storage.models.KeyPair.findOrCreate({
                    where: {
                        publicKey: key.publicKey,
                        keyType: key.keyType
                    },
                    defaults: key
                }).then((row, created) => {
                    if (created)
                        stats.keys++;
                    return Promise.resolve(row);
                })
            })


        }

        for (let dialog of json.dialogs) {
            if (dialog.id)
                delete dialog.id;

            promise = promise.then(() => {
                return this.storage.models.Dialog.findOrCreate({
                    where: {
                        localkey: dialog.localkey,
                        externalkey: dialog.externalkey
                    },
                    defaults: dialog
                }).then((row, created) => {
                    if (created)
                        stats.dialogs++;
                    return Promise.resolve(row);
                })
            })

        }

        for (let media of json.medias) {
            if (media.id)
                delete media.id;

            promise = promise.then(() => {
                return this.storage.models.Media.findOrCreate({
                    where: {
                        publicKey: media.publicKey,
                        type: media.type
                    },
                    defaults: media
                }).then((row, created) => {
                    if (!created) {
                        if (!row.local && media.local) {
                            row.local = 1;
                            return row.save()
                        }
                    }

                    if (created)
                        stats.media++;
                    return Promise.resolve(row);
                })
            })
        }

        for (let follower of json.followers) {
            if (follower.id)
                delete follower.id;

            promise = promise.then(() => {
                return this.storage.models.Follower.findOrCreate({
                    where: {
                        localkey: follower.localkey,
                        followerkey: follower.followerkey
                    },
                    defaults: follower
                }).then((row, created) => {
                    if (created)
                        stats.followers++;
                    return Promise.resolve(row);
                })
            })
        }

        function decrypt(buff) {
            const secret = cr.createHash('sha256').update(cr.createHash('sha256').update(password).digest()).digest();
            const algorithm = 'aes-256-ctr';
            const iv = buff.slice(0, 16);
            const encryptedData = buff.slice(16);
            let decipher = cr.createDecipheriv(algorithm, secret, iv);
            let decrypted = decipher.update(encryptedData);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        }

        return promise
            .then(() => {
                return Promise.resolve(stats)
            });
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
    removeContact(idOrExternalKeyOrName) {
        return this.storage.dialogs.removeByIdent(idOrExternalKeyOrName);
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
    sendToNick(name, buffer) {

        //look nick in state
        //if not have - error throw
        let state = this.getNickname(name);
        if (!state || !state.xpub || state.type != 'NICKNAME')
            throw new Error('Nick @' + name + ' is not exist or it is a media');
        //look dialog with $name = name
        return this.storage.models.Dialog.findOne({
            where: {
                name: "@" + name
            }
        })
            .then((dialog) => {

                //if have - sendById 
                if (dialog)
                    return this.sendById(dialog.id, buffer);

                //if not: send encrypted with hellopublickey
                return this.crypto.encrypt({ externalkeyWithDerive: state.xpub }, buffer, this.Crypto.HELLOPUBLICKEY, "@" + name)
                    .then((buffer) => {
                        return this.crypto.payloadBroadcast(buffer);
                    })
            })

    }
    getDialogById(id) {
        return this.storage.dialogs.getById(id);
    }
    getDialogMessageHistory(id, offset, limit) {
        return this.storage.messages.getAllByDialogId(id, offset, limit);
    }
    createEmptyKey() {
        return this.storage.keys.createEmpty();
    }
    createEmptyMediaKey() {
        return this.storage.keys.createPublicEmpty();
    }
    getAllKeys() {
        return this.storage.keys.usages();
    }
    getAllDialogs(limit, offset) {
        return this.storage.dialogs.list(limit, offset)
    }
    getMyMedia() {
        return this.storage.models.Media.findAll({ where: { local: 1, type: ['MEDIA_PUBLIC', 'MEDIA_PRIVATE'] } })
    }
    getMyNickname() {
        return this.storage.models.Media.findAll({ where: { local: 1, type: 'NICKNAME' } })
    }
    createNickname(name) {
        return this.createMedia(name, 'NICKNAME');
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
    getNickname(name) {
        return this.getMedia(name)
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
    sha256d(message, output) {
        return this.crypto.sha256d(message, output)
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
        if (exitCode || exitCode === 0) this.debug('common', 'error', 'exit code', exitCode);
        if (options.exception) {
            this.debug('common', 'error', 'uncatch error', options);
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