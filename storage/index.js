const { Sequelize, Model, DataTypes, Op } = require('sequelize');

function initdb(app) { //'your-encryption-key'
    //TOOO: import/export db
    //TODO: autoremove old keys on removeDialog and unfollow.

    let path = app.getLocalHomePath(app.config.appname || 'ctrlim');
    const sequelize = new Sequelize('control', '', app.config.db.secret, {
        dialect: 'sqlite',
        dialectModulePath: '@journeyapps/sqlcipher',
        storage: path + "/" + (app.testmod ? 'keypool.tests.db' : 'keypool.db'),
        logging: false
    });

    // SQLCipher config
    return Promise.all([
        sequelize.query('PRAGMA cipher_page_size = 4096'),
        sequelize.query('PRAGMA kdf_iter = 256000'),
        sequelize.query('PRAGMA cipher_hmac_algorithm = HMAC_SHA512'),
        sequelize.query('PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512'),
        sequelize.query('PRAGMA cipher_page_size = 4096'),
        sequelize.query('PRAGMA cipher_compatibility = 3'),
        sequelize.query("PRAGMA key = '" + app.config.db.secret + "'")
    ])
        .then(() => {
            class Account extends Model { }
            class KeyPair extends Model { }
            class Dialog extends Model { }
            class Media extends Model { }
            class Follower extends Model { }

            class Message extends Model {
                /*render(cutted) {
                    if (cutted) {
                        return ejs.render(fs.readFileSync(path.join(__dirname, "../../../../", "templates/parts", 'cutted_chat_message.ejs'), 'utf8'), { msg: this })
                    } else
                        return ejs.render(fs.readFileSync(path.join(__dirname, "../../../../", "templates/parts", 'chat_message.ejs'), 'utf8'), { msg: this })
                }
                renderDate() {
                    let date = this.createdAt; //new Date(timestamp * 1000);
                    return ('0' + date.getDate()).slice(-2) + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + date.getFullYear() + ' ' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
                }*/
            }

            Account.init({
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                mnemonic: DataTypes.STRING,
                seed: DataTypes.STRING,
                name: DataTypes.STRING,
                privateKey: DataTypes.STRING,
                publicKey: DataTypes.STRING,
            }, { sequelize, modelName: 'account' });

            KeyPair.init({
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                publicKey: DataTypes.STRING,
                privateKey: DataTypes.STRING,
                path: DataTypes.STRING,
                index: DataTypes.INTEGER,
                keyType: DataTypes.STRING,
                xpub: DataTypes.STRING,
            }, { sequelize, modelName: 'keypair' });

            Dialog.init({
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                localkey: DataTypes.STRING,
                externalkey: DataTypes.STRING,
                name: DataTypes.STRING,
                isMedia: DataTypes.INTEGER
                //receiver data from handshake
            }, { sequelize, modelName: 'dialog' });

            Message.init({
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                dialog_id: DataTypes.INTEGER,
                type: DataTypes.STRING,
                content: DataTypes.STRING,
                hash: DataTypes.STRING,
                self: DataTypes.INTEGER,
                json: DataTypes.STRING,
                nonce: DataTypes.INTEGER,
                time: DataTypes.INTEGER,
                network_hash: DataTypes.STRING,
            }, { sequelize, modelName: 'message' })

            Media.init({
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                xpub: DataTypes.STRING,
                publicKey: DataTypes.STRING,
                name: DataTypes.STRING,
                type: DataTypes.STRING,
            }, { sequelize, modelName: 'media' });

            Follower.init({
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                localkey: DataTypes.STRING,
                followerkey: DataTypes.STRING,
            }, { sequelize, modelName: 'follower' });


            return Promise.resolve({
                sequelize,
                Account,
                KeyPair,
                Dialog,
                Message,
                Media,
                Follower
            })
        })


}


class db {
    constructor(app) {
        this.app = app;
    }
    init(existSeed) {

        return initdb(this.app)
            .then(d => {
                this.instance = d.sequelize;
                this.models = {
                    Account: d.Account,
                    KeyPair: d.KeyPair,
                    Dialog: d.Dialog,
                    Message: d.Message,
                    Media: d.Media,
                    Follower: d.Follower,
                }

                return this.instance.sync({ alter: true })
            })
            .catch(e => {
                if (e.message == 'SQLITE_NOTADB: file is not a database') {
                    //wrong password catched
                    this.app.emit('wrongpassword');
                    return Promise.reject('wrong password');
                }
            })
            .then(() => {
                this.accounts = new accountsManager(this.instance, this);
                this.keys = new keysManager(this.instance, this);
                this.dialogs = new dialogManager(this.instance, this);
                this.messages = new messageManager(this.instance, this);
                this.medias = new mediaManager(this.instance, this);
                this.followers = new followersManager(this.instance, this);

                this.app.on('beforeDestroy', () => {
                    this.app.emit("module.destroy", { name: 'storage', promise: this.instance.close() });
                })

                return this.accounts.load('default', existSeed);
            })
    }
    rollback() {
        if (this.app.testmod) {
            return Promise.all([
                this.keys.rollback(),
                this.dialogs.rollback(),
                this.accounts.rollback(),
                this.messages.rollback(),
                this.medias.rollback(),
                this.followers.rollback()
            ]);
        }

        return Promise.resolve();
    }
}

module.exports = db;

class accountsManager {
    constructor(sequelize, db) {
        this.db = db;
    }
    init() {
        return this.db.models.Account.count()
            .then((cnt) => {
                if (!cnt) {
                    return this.create();
                } else {
                    return this.db.models.Account.findOne();
                }
            })
    }
    create(name, _seed) {
        let pair = this.db.app.crypto.seed.createMnemonicPair('english', _seed);
        let seed = new this.db.app.crypto.seed(pair);
        let key = seed.getMaster();

        //check existing before
        return this.db.models.Account.create({
            mnemonic: pair.mnemonic,
            seed: pair.seed || _seed,
            name: name || 'default',
            privateKey: key.privateKey.toString('hex'),
            publicKey: key.publicKey.toString('hex'),
        });
    }
    load(name, seed) {
        if (!name)
            name = 'default';

        let q = {};
        if (!seed) {
            q = {
                name: name
            };
        } else {
            q = {
                where: {
                    [Op.or]: [{
                        seed: seed
                    },
                    {
                        mnemonic: seed
                    }
                    ]
                }
            };
        }


        return this.db.models.Account.findOne(q)
            .then((acc) => {

                let pro = Promise.resolve(acc);
                if (!acc) {
                    pro = this.create(name, seed)
                }

                return pro
                    .then(acc => {
                        return Promise.resolve(new this.db.app.crypto.seed(acc));
                    })

            })
    }
    seedAccess(name, fn) {

        if (name instanceof Function) {
            fn = name;
            name = 'default';
        }

        return this.load(name)
            .then(seed => {
                return fn(seed);
            })
    }
    rollback() {
        return this.db.models.Account.destroy({ truncate: true, cascade: false })
    }
}

class keysManager {
    constructor(sequelize, db) {
        this.db = db;
        this.history = [];
    }
    createFromDerive(keystore, path) { //TODO!
        //xpub is SEED object.

        let child;
        //must create key, add it to db is not exist,
        return this.getPublicIndexKeyObject(keystore.index)
            .then((key) => {
                child = key.derive("m/44/9999/" + path, true); //todo make constant here.
                return this.db.models.KeyPair.findOne({
                    where: {
                        publicKey: child.publicKey
                    },
                    order: [
                        ['index', 'DESC']
                    ]
                })
            })
            .then((keypair) => {
                if (keypair) {
                    keypair.isOld = true;
                    return Promise.resolve(keypair)
                }

                let d = {
                    publicKey: child.publicKey.toString('hex'),
                    privateKey: child.privateKey.toString('hex'),
                    path: path,
                    index: -999,
                    keyType: 'public_outcome',
                };

                return this.db.models.KeyPair.create(d)
            })
            .then((key) => {
                if (this.db.app.testmod && !key.isOld)
                    this.history.push(key);
                return Promise.resolve(key);
            })

    }
    create(type) {
        if (!type)
            type = 'private_dialog';

        //get last index id
        //increment
        //seedaccess
        //get from seed
        //save
        //return
        return this.db.models.KeyPair.findOne({
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
                    index = keypair.index + 1;

                return this.db.accounts.seedAccess((seed) => {
                    let key = seed.createKey(index);
                    key.index = index;
                    return Promise.resolve(key)
                })

            })
            .then((key) => {

                let d = {
                    publicKey: key.publicKey.toString('hex'),
                    privateKey: key.privateKey.toString('hex'),
                    path: key.path,
                    index: key.index,
                    keyType: type,
                };

                return this.db.models.KeyPair.create(d);
            })
            .then((key) => {
                if (this.db.app.testmod)
                    this.history.push(key);
                return Promise.resolve(key);
            })
    }
    createEmpty() {
        let type = 'private_dialog';

        return this.db.models.KeyPair.findOne({
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
                let prms = Promise.resolve(1000);
                if (keypair)
                    prms = this.db.models.Dialog.count({
                        where: { 'localkey': keypair.publicKey }
                    });

                return prms
                    .then((c) => {
                        if (c > 0) {
                            let index = (keypair ? keypair.index : 0) + 1;

                            return this.db.accounts.seedAccess((seed) => {
                                let key = seed.createKey(index);
                                key.index = index;
                                return Promise.resolve(key)
                            })
                        } else {
                            return this.db.accounts.seedAccess((seed) => {
                                let key = seed.createKey(keypair.index);
                                key.index = keypair.index;
                                return key;
                            });
                        }
                    })
            })
            .then((key) => {

                let d = {
                    publicKey: key.publicKey.toString('hex'),
                    privateKey: key.privateKey.toString('hex'),
                    path: key.path,
                    index: key.index,
                    keyType: type,
                };

                return this.db.models.KeyPair.create(d);
            })
            .then((key) => {
                if (this.db.app.testmod)
                    this.history.push(key);
                return Promise.resolve(key);
            })
    }
    createPublicEmpty() {
        let type = 'media';

        return this.db.models.KeyPair.findOne({
            where: {
                index: {
                    [Op.gte]: 0,
                },
                keyType: type
            },
            order: [
                ['index', 'DESC']
            ]
        })
            .then((keypair) => {
                let prms = Promise.resolve(1000);
                //for media we are create new key every time
                /*if (keypair)
                    prms = this.db.models.Dialog.count({
                        where: { 'localkey': keypair.publicKey }
                    });
                    */

                return prms
                    .then((c) => {
                        let index = (keypair ? keypair.index : 0) + 1;
                        return this.db.accounts.seedAccess((seed) => {
                            let key = seed.createPublicKeypair(index);
                            key.index = index;
                            return Promise.resolve(key)
                        })

                    })
            })
            .then((key) => {

                let d = {
                    publicKey: key.publicKey.toString('hex'),
                    privateKey: key.privateKey.toString('hex'),
                    path: key.path,
                    index: key.index,
                    keyType: type,
                    xpub: key.publicExtendedKey
                };

                return this.db.models.KeyPair.create(d);
            })
            .then((key) => {
                if (this.db.app.testmod)
                    this.history.push(key);
                return Promise.resolve(key);
            })
    }
    createIndex(index, type) {
        if (!type)
            type = 'private_dialog';

        let _key;
        return this.db.accounts.seedAccess((seed) => {
            let key = seed.createKey(index);
            key.index = index;
            return Promise.resolve(key)
        })
            .then((key) => {
                _key = key;
                return this.db.models.KeyPair.findOne({
                    where: {
                        index: index,
                        publicKey: key.publicKey.toString('hex')
                    }
                })
            })
            .then((exist) => {
                if (exist) {
                    exist.exist = true;
                    return Promise.resolve(exist);
                }

                let d = {
                    publicKey: _key.publicKey.toString('hex'),
                    privateKey: _key.privateKey.toString('hex'),
                    path: _key.path,
                    index: _key.index,
                    keyType: type,
                };

                return this.db.models.KeyPair.create(d);
            })
            .then((key) => {
                if (this.db.app.testmod && !key.exist)
                    this.history.push(key);
                return Promise.resolve(key);
            })
    }
    createPublicIndex(index) {
        let type = 'public_dialog';
        let _key;

        return this.db.accounts.seedAccess((seed) => {
            let key = seed.createPublicKeypair(index);
            key.index = index;
            return Promise.resolve(key)
        })
            .then((key) => {

                _key = key;
                return this.db.models.KeyPair.findOne({
                    where: {
                        keyType: type,
                        index: index,
                        publicKey: key.publicKey.toString('hex')
                    }
                })
            })
            .then((exist) => {
                if (exist) {
                    exist.exist = true;
                    return Promise.resolve(exist);
                }

                let d = {
                    publicKey: _key.publicKey.toString('hex'),
                    privateKey: _key.privateKey.toString('hex'),
                    path: _key.path,
                    index: _key.index,
                    keyType: type,
                    xpub: _key.publicExtendedKey
                };

                return this.db.models.KeyPair.create(d);
            })
            .then((key) => {
                if (this.db.app.testmod && !key.exist)
                    this.history.push(key);
                return Promise.resolve(key);
            })
    }
    getPublicIndexKeyObject(index) {
        return this.db.accounts.seedAccess((seed) => {
            let key = seed.createPublicKeypair(index);
            return Promise.resolve(key)
        })
    }
    get(publicKey) {
        return this.db.models.KeyPair.findOne({
            where: {
                publicKey: publicKey
            }
        })
            .then((key) => {
                if (key)
                    return Promise.resolve(key);

                return this.db.accounts.seedAccess((seed) => {
                    return seed.tryFind(publicKey);
                })
                    .then((index) => {
                        if (index !== false)
                            return this.createIndex(index);
                        return Promise.reject('can not find publicKey ' + publicKey + ' in this seed');
                    })

            })
    }
    getAll(keys) {
        return this.db.models.KeyPair.findAll({
            where: {
                publicKey: keys
            }
        })
            .then((key) => {
                if (key.length > 0)
                    return Promise.resolve(key);

                let promise = [];
                for (let i in keys) {
                    promise.push(
                        this.db.accounts.seedAccess((seed) => {
                            return seed.tryFind(keys[i]);
                        })
                            .then((index) => {
                                if (index !== false)
                                    return this.createIndex(index);

                                return Promise.resolve(false);
                            })
                    )
                }

                return Promise.all(promise)
                    .then((list) => {
                        let items = [];
                        for (let i in list) {
                            if (list[i])
                                items.push(list[i])
                        }

                        return Promise.resolve(items);
                    })

            })
    }
    usages() {
        let promise = Promise.resolve();
        let keys = [];
        return this.db.models.KeyPair.findAll({})
            .then(list => {
                for (let key of list) {
                    if (!key)
                        continue;

                    promise = promise.then(() => {
                        return this.db.models.Dialog.count({ where: { localkey: key.publicKey } })
                            .then((cnt) => {
                                keys.push({ publicKey: key.publicKey, count: cnt });
                                return Promise.resolve();
                            })
                    });
                }

                return promise;
            })
            .then(() => {
                return Promise.resolve(keys);
            })
    }
    map(fn) {
        return this.db.models.KeyPair.findAll({})
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        return Promise.resolve(i);
                }

                return Promise.resolve(false);
            })
    }
    mapAll(fn) {
        let items = [];
        return this.db.models.KeyPair.findAll({})
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        items.push(i);
                }

                return Promise.resolve(items);
            })
    }
    rollback() {
        let promise = Promise.resolve();
        for (let i in this.history) {
            promise = promise.then(() => {
                if (this.history[i].action == 'delete') {
                    let type = this.db.models[this.history[i].type];
                    let obj = new type();
                    return obj.create(this.history[i].data);
                }

                return this.history[i].destroy()
            })
        }

        return promise;
    }
}

class dialogManager {
    constructor(sequelize, db) {
        this.db = db;
        this.history = [];
    }
    add(localkey, externalkey, name, isMedia) {

        if (localkey instanceof Buffer)
            localkey = localkey.toString('hex');

        if (externalkey instanceof Buffer)
            externalkey = externalkey.toString('hex');

        if (name) {
            if (name[0] == '@')
                isMedia = 1;
        }
        return this.db.models.Dialog.findOne({
            where: {
                isMedia: isMedia ? 1 : 0,
                localkey,
                externalkey
            }
        })
            .then((res) => {
                if (res)
                    return Promise.resolve(res);

                return this.db.models.Dialog.create({
                    localkey,
                    externalkey,
                    name,
                    isMedia: isMedia ? 1 : 0,
                });
            })
            .then((dialog) => {
                if (this.db.app.testmod)
                    this.history.push(dialog);
                return Promise.resolve(dialog);
            })
    }
    removeByIdent(ident) {
        return this.db.models.Dialog.findOne({
            where: {
                [Op.or]: [{ id: ident }, { externalkey: ident }, { name: ident }]
            }
        })
            .then(dialog => {
                if (!dialog)
                    return Promise.resolve(false);

                return dialog.destroy();
            })
    }
    remove(localkey, externalkey) {

        if (localkey instanceof Buffer)
            localkey = localkey.toString('hex');

        if (externalkey instanceof Buffer)
            externalkey = externalkey.toString('hex');

        return this.db.models.Dialog.findOne({
            where: {
                localkey,
                externalkey
            }
        })
            .then((res) => {
                if (!res)
                    return Promise.resolve(res);

                return res.destroy();
            })
            .then(() => {
                if (this.db.app.testmod)
                    this.history.push({
                        action: 'delete',
                        type: 'Dialog',
                        data: {
                            localkey,
                            externalkey
                        }
                    });
                return Promise.resolve();
            })
    }
    getFollowerKey(media_name) {
        return this.db.models.Dialog.findOne({
            where: {
                externalkey: media_name
            }
        })
    }
    list(limit, offset) {
        let w = { order: [['createdAt', 'DESC']] };

        if (limit) {

            w.limit = limit;
            w.offset = offset;

            if (!offset)
                w.offset = 0;
        }

        return this.db.models.Dialog.findAll(w)
            .then(list => {
                let arr = [];
                for (let d of list) {
                    arr.push({
                        localkey: d.localkey,
                        externalkey: d.externalkey,
                        id: d.id,
                        name: d.name,
                    });
                }

                return Promise.resolve(arr);
            })
    }
    map(fn) {
        return this.db.models.Dialog.findAll({})
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        return Promise.resolve(i);
                }

                return Promise.resolve(false);
            })
    }
    mapAll(fn) {
        let items = [];
        return this.db.models.Dialog.findAll({})
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        items.push(i);
                }

                return Promise.resolve(items);
            })
    }
    getById(id) {
        return this.db.models.Dialog.findByPk(id)
    }
    rollback() {
        let promise = Promise.resolve();
        for (let i in this.history) {
            promise = promise.then(() => {
                if (this.history[i].action == 'delete') {
                    let type = this.db.models[this.history[i].type];
                    //let obj = new type();
                    return type.create(this.history[i].data);
                }

                return this.history[i].destroy()
            })
        }

        return promise;
    }
}

class messageManager {
    constructor(sequelize, db) {
        this.db = db;
        this.history = [];
    }

    getList(where, order, offset, limit) {
        if (!limit)
            limit = 100;
        if (!offset)
            offset = 0;

        return this.db.models.Message.findAll({
            where: where,
            order: order,
            limit: limit,
            offset: offset,
        });
    }
    add(dialog_id, hash, content, self, type, json, nonce, time, net_hash) {

        if (!type)
            type = 'text';

        return this.db.models.Message.findOne({
            where: {
                dialog_id,
                hash
            }
        })
            .then((res) => {

                if (res)
                    return Promise.resolve(res);

                return this.db.models.Message.create({
                    type,
                    self,
                    content,
                    dialog_id,
                    hash,
                    json,
                    nonce,
                    time,
                    network_hash: net_hash
                });
            })
            .then((msg) => {
                if (this.db.app.testmod)
                    this.history.push(msg);
                return Promise.resolve(msg);
            })
    }
    remove(hash) {
        let _data;
        return this.db.models.Message.findOne({
            where: {
                hash
            }
        })
            .then((res) => {
                if (!res)
                    return Promise.resolve(res);

                _data = res;
                return res.destroy();
            })
            .then(() => {
                if (this.db.app.testmod)
                    this.history.push({
                        action: 'delete',
                        type: 'Message',
                        data: _data.toJSON()
                    });
                return Promise.resolve();
            })
    }
    map(fn) {
        return this.db.models.Message.findAll({})
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        return Promise.resolve(i);
                }

                return Promise.resolve(false);
            })
    }
    getById(id) {
        return this.db.models.Message.findByPk(id)
    }
    rollback() {
        let promise = Promise.resolve();
        for (let i in this.history) {
            promise = promise.then(() => {
                if (this.history[i].action == 'delete') {
                    let type = this.db.models[this.history[i].type];
                    //let obj = new type();

                    return type.create(this.history[i].data);
                }

                return this.history[i].destroy()
            })
        }

        return promise;
    }
}

class mediaManager {
    constructor(sequelize, db) {
        this.db = db;
        this.history = [];
    }
    getList(where, order, offset, limit) {
        if (!limit)
            limit = 100;
        if (!offset)
            offset = 0;

        return this.db.models.Media.findAll({
            where: where,
            order: order,
            limit: limit,
            offset: offset,
        });
    }
    add(type, name, xpub, publicKey) {
        if (!type)
            throw new Error('type, nick and xpub must be set');

        return this.db.models.Media.findOne({
            where: {
                name,
                xpub
            }
        })
            .then((res) => {
                if (res)
                    return Promise.resolve(res);

                return this.db.models.Media.create({
                    type,
                    name,
                    xpub,
                    publicKey
                });
            })
            .then((media) => {
                if (this.db.app.testmod)
                    this.history.push(media);
                return Promise.resolve(media);
            })
    }
    get(name) {
        return this.db.models.Media.findOne({
            where: {
                name
            }
        })
    }
    getByPublicKey(publicKey) {
        return this.db.models.Media.findOne({
            where: {
                publicKey
            }
        })
    }
    map(fn) {
        return this.db.models.Media.findAll({})
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        return Promise.resolve(i);
                }

                return Promise.resolve(false);
            })
    }
    mapAll(fn) {
        let items = [];
        return this.db.models.Media.findAll({})
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        items.push(i);
                }

                return Promise.resolve(items);
            })
    }
    getById(id) {
        return this.db.models.Media.findByPk(id)
    }
    rollback() {
        let promise = Promise.resolve();
        for (let i in this.history) {
            promise = promise.then(() => {
                if (this.history[i].action == 'delete') {
                    let type = this.db.models[this.history[i].type];
                    //let obj = new type();
                    return type.create(this.history[i].data);
                }

                return this.history[i].destroy()
            })
        }

        return promise;
    }
}

class followersManager {
    constructor(sequelize, db) {
        this.db = db;
        this.history = [];
    }
    add(localkey, followerkey) {
        if (!localkey)
            throw new Error('localkey must be set');

        if (!followerkey)
            throw new Error('followerkey must be set');

        return this.db.models.Follower.findOne({
            where: {
                localkey,
                followerkey
            }
        })
            .then((res) => {
                if (res)
                    return Promise.resolve(res);

                return this.db.models.Follower.create({
                    localkey,
                    followerkey
                });
            })
            .then((media) => {
                if (this.db.app.testmod)
                    this.history.push(media);
                return Promise.resolve(media);
            })
    }
    remove(localkey, followerkey) {
        if (!localkey)
            throw new Error('localkey must be set');

        if (!followerkey)
            throw new Error('followerkey must be set');

        return this.db.models.Follower.findOne({
            where: {
                localkey,
                followerkey
            }
        })
            .then((res) => {
                if (!res)
                    return Promise.resolve(false);

                return res.destroy();
            })
            .then(() => {
                if (this.db.app.testmod)
                    this.history.push({
                        action: 'delete',
                        type: 'Follower',
                        data: {
                            localkey,
                            followerkey
                        }
                    });
            })
    }
    map(query, fn) {
        return this.db.models.Follower.findAll(query)
            .then(list => {
                for (let i of list) {
                    if (fn(i))
                        return Promise.resolve(i);
                }

                return Promise.resolve(false);
            })
    }
    rollback() {
        let promise = Promise.resolve();
        for (let i in this.history) {
            promise = promise.then(() => {
                if (this.history[i].action == 'delete') {
                    let type = this.db.models[this.history[i].type];
                    //let obj = new type();
                    return type.create(this.history[i].data);
                }

                return this.history[i].destroy()
            })
        }

        return promise;
    }
}