const bitPony = require('bitpony');
const EC = require('elliptic').ec;
const cr = require('crypto');
const filtercryptography = require('filtergraphy');
const { Op } = require('sequelize')

const SECRET = '5c4d018cdceb47b7051045c29d3130203b999f03d3c4200b7fe957ea9915125';

class Crypto {
    constructor(app) {
        this.app = app;

        this.cr = new filtercryptography();
        this.seed = this.cr.seed;
        this.messageSchema = this.cr.messageSchema;
        this.initMessageSchemas();

        app.on('network.message', (...params) => { return this.incomingmessagehandle(...params) });
    }
    initMessageSchemas() {

        require('./schema')(this.app, this.messageSchema.TextMessage);

    }
    init() {

        this.cr.on('NET:sendmempool', ({ hash, time, nonce, payload, sign }, callback) => {
            this.app.network.broadcast(hash, time, nonce, payload, sign)
                .then(() => {
                    callback(hash);
                })
        });

        this.cr.on('follower', (...params) => {
            this.app.emit('follower', ...params)
        })

        this.cr.on('notfollower', (...params) => {
            this.app.emit('notfollower', ...params)
        })

        this.cr.on('msg', (...params) => {
            this.app.emit('msg', ...params)
        });

        /*decrypt events*/
        this.cr.on('addDialog', (localkey, externalkey, callback) => {
            this.app.storage.dialogs.add(localkey, externalkey)
                .then(() => {
                    callback();
                })
        })

        this.cr.on('removeDialog', (localkey, externalkey, callback) => {
            this.app.storage.dialogs.remove(localkey, externalkey)
                .then(() => {
                    callback();
                })
        })

        //todo: cache this
        this.cr.on('getAllLocalPublicKeysList', (callback) => {
            this.app.storage.models.KeyPair.findAll({})
                .then((list) => {

                    let keys = [];
                    for (let i in list) {
                        keys.push(list[i].publicKey)
                    }

                    callback(keys);
                })

        })

        this.cr.on('getMediaKeys', (callback) => {
            callback([])
        })

        this.cr.on('getKeyInfo', (key, callback) => {
            let keystore, dialog;

            this.app.storage.keys.get(key)
                .then(_ => {
                    keystore = _;
                    return this.app.storage.dialogs.map((item) => {
                        return item.localkey == key;
                    })
                })
                .then(_ => {
                    dialog = _;
                    callback(dialog, keystore);
                })

        })

        /*encrypt events*/

        this.cr.on('getKeystoreByMeta', (context, version, callback) => {

            //check version later
            this.app.storage.keys.get(context.localkey)
                .then(_ => {
                    callback(_);
                })

        });

        /*keys events*/
        this.cr.on('seedAccess', (callback) => {
            this.app.storage.accounts.seedAccess(seed => {
                callback(seed);
            });
        })

        this.cr.on('getLastIndex', (callback) => {

            this.app.storage.models.KeyPair.findOne({
                where: {
                    index: {
                        [Op.gte]: 0
                    }
                },
                order: [
                    ['index', 'DESC']
                ]
            })
                .then((keypair) => {
                    let index = 0;
                    if (!keypair)
                        index = 0;
                    else
                        index = keypair.index;

                    callback(index);
                })

        })

        this.cr.on('getLastPublicIndex', (callback) => {

            this.app.storage.models.KeyPair.findOne({
                where: {
                    index: {
                        [Op.gte]: 0,
                        keyType: 'public_dialog'
                    }
                },
                order: [
                    ['index', 'DESC']
                ]
            })
                .then((keypair) => {
                    let index = 0;
                    if (!keypair)
                        index = 0;
                    else
                        index = keypair.index;

                    callback(index);
                })

        })

        this.cr.on('saveNewKey', (type, keystore, callback) => {
            //save key to database
            this.app.storage.models.KeyPair.create({
                publicKey: keystore.publicKey,
                privateKey: keystore.privateKey,
                path: keystore.path,
                index: keystore.index,
                keyType: keystore.keyType || type,
            })
                .then(() => {
                    callback(keystore);
                })
        });

        //media:
        this.cr.on('NET:getMediaInfo', (name, callback) => {
            callback(this.app.getMedia(name))
        })

        this.cr.on('NET:saveMediaInfo', (name, data, callback) => {

            this.app.network.setState(name, {
                type: data.type,
                hash: data.hash,
                nonce: data.nonce,
                time: data.time,
                sign: data.sign,
                xpub: data.xpub,
                publicKey: data.publicKey
            });

            callback(data);
        })

        this.cr.on('saveMediaInfo', (data, callback) => {

            this.app.storage.medias.add(data.type, data.name, data.xpub, data.publicKey)
                .then(() => {
                    callback(data)
                })

        })

        this.cr.on('getMediaInfo', (nameOrKey, callback) => {

            this.app.storage.medias.get(nameOrKey)
                .then(media => {
                    if (!media)
                        return Promise.resolve(0);

                    callback(media);
                })
                .then(() => {
                    return this.app.storage.medias.getByPublicKey(nameOrKey)
                })
                .then((_) => {
                    callback(_)
                })
        })

        this.cr.on('NET:setFollowState', (mediaName, followerState, callback) => {

            this.app.network.setFollowState(mediaName, {
                hash: followerState.hash,
                nonce: followerState.nonce,
                time: followerState.time,
                sign: followerState.sign,
                publicKey: followerState.publicKey,
                follow: followerState.follow,
            });

            callback();
        })

        this.cr.on('NET:getFollowState', (mediaName, followerKey, callback) => {
            callback(this.app.network.getFollowState(mediaName, followerKey));
        })

        this.cr.on('getAllFollowedMediaKeys', (callback) => {

            let names = [];
            this.app.storage.medias
                .mapAll((item) => {
                    names.push(item.name);
                    return false;
                })
                .then(() => {
                    callback(names)
                })

        })

        /**
         * another events
         */

        this.cr.on('NET:getMempoolHistory', (callback) => {

            let times = [];
            const h = this.app.network.document.get('mempool').history();
            const N = 100;
            for (let i = h.length - 1; i >= 0; i--) {
                if (i - h.length > N)
                    break;

                times.push(h[i][0][1].time);
            }

            callback(times);
        });

        this.cr.on('addMediaDialog', (localkey, mediaName, callback) => {
            this.addMediaDialog(localkey, mediaName, "@" + mediaName)
                .then((dialog) => {
                    callback(dialog);
                })
        })

        this.cr.on('removeMediaDialog', (localkey, mediaName, callback) => {
            this.removeDialog(localkey, mediaName)
                .then(() => {
                    callback();
                })
        })

        this.cr.on('getDialogWithMedia', (mediaName, callback) => {
            this.app.storage.dialogs.map(item => {
                return item.externalkey == mediaName
            })
                .then(dialog => {
                    callback(dialog)
                })
        })

        this.cr.on('getDialogByExternalKey', (externalkey, callback) => {
            this.app.storage.dialogs.map(item => {
                return item.externalkey == externalkey
            })
                .then(dialog => {
                    callback(dialog)
                })
        })

        this.cr.on('getMediaFollowers', (mediaPublicKey, callback) => {
            this.app.storage.models.Follower.findAll({
                where: {
                    localkey: mediaPublicKey
                }
            })
                .then((list) => {
                    let keys = [];
                    for (let f of list) {
                        keys.push(f.followerkey);
                    }
                    callback(keys)
                })
        })

        this.cr.on('saveMessage', (dialog, content, options, callback) => {

            this.app.saveMessage(dialog.id, content, {
                self: options.self, //self
                nonce: options.nonce,
                time: options.time,
                hash: options.hash,
                message_id: options.hash
            })
                .then(() => {
                    callback({ hash: options.hash });
                })
        })

        this.cr.on('addFollower', (localkey, followerkey, callback) => {
            this.app.storage.followers.add(localkey, followerkey)
                .then(() => {
                    callback()
                })
        })

        this.cr.on('removeFollower', (localkey, followerkey, callback) => {
            this.app.storage.followers.remove(localkey, followerkey)
                .then(() => {
                    callback()
                })
        })


        return Promise.resolve(this);
    }
    incomingmessagehandle({ hash, message, callback }) {
        //todo: we need light method for check incoming messages from network (fast)
        this.cr.incomingmessagehandle({ hash, message })
            .then(() => {
                callback();
            })
    }
    sendById(dialog_id, buffer) {
        return this.app.storage.dialogs.getById(dialog_id)
            .then(dialog => {
                return this.encrypt(dialog, buffer, Crypto.FILTERFROMFILTERTO);
            })
    }
    addDialog(localkey, externalkey, title) {
        return this.app.storage.dialogs.add(localkey, externalkey, title);
    }
    addMediaDialog(localkey, media_name, media_title) {
        return this.app.storage.dialogs.add(localkey, media_name, media_title, true);
    }
    removeDialog(localkey, externalkey) {
        return this.app.storage.dialogs.remove(localkey, externalkey);
    }
    importKey(index) {
        if (!index)
            return Promise.reject('For import we need index');

        return this.app.storage.keys.createIndex(index);
    }
    importKeys(indexes) {
        let promise = Promise.resolve();

        for (let index of indexes) {
            promise = promise.then(() => {

                return this.importKey(index);

            })
        }

        return promise;
    }
    createKeyPair(type) {
        return this.cr.createKeyPair(type)
    }
    createPublicKeyPair() {
        return this.cr.createPublicKeyPair()
    }
    encrypt(context, buffer, version) {
        return this.cr.encrypt(context, buffer, version);
    }
    decrypt(buffer) {
        return this.cr.decrypt(buffer);
    }
    payloadBroadcast(payload) {
        return this.cr._broadcastMessage(payload)
    }
    //media
    getMedia(name) {
        return this.cr.getMedia(name)
    }
    createMedia(name, type) {
        return this.cr.createMedia(name, type)
    }
    follow(mediaName) {
        return this.cr.follow(mediaName);
    }
    unfollow(mediaName) {
        return this.cr.unfollow(mediaName);
    }
    getFollowState(mediaName, followerKey) {
        return this.cr.getFollowState(mediaName, followerKey)
    }
    mediaBroadcast(mediaName, buffer) {
        return this.cr.mediaBroadcast(mediaName, buffer);
    }
    sha256(message, output) {
        if (!output)
            output = '';
        return cr.createHash('sha256').update(message).digest(output);
    }
    sha256d(message, output) {
        if (!output)
            output = '';
        return cr.createHash('sha256').update(cr.createHash('sha256').update(message).digest()).digest(output);
    }
}

Crypto.FILTERTO = 1;
Crypto.FILTERFROMFILTERTO = 2;
Crypto.KEYTO = 3;
Crypto.KEYFROMKEYTO = 4;
Crypto.MEDIA = 5;
//
Crypto.HELLOPUBLICKEY = 10;
Crypto.TEMPKEY = 11;

module.exports = Crypto;