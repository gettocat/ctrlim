const hyperswarm = require('hyperswarm')
const ScuttleBoat = require('scuttleboat');
const Model = require('scuttlebutt/model');
//const ExpiryModel = require('expiry-model');
const net = require('net');
const HDKey = require('hdkey');
const diff = require('recursive-diff');

module.exports = function (app) {

    MempoolFnc.prototype.constructor = MempoolFnc;

    function NetworkModelFnc(opts) {
        return new NetworkModel(opts);
    }

    NetworkModelFnc.prototype.constructor = NetworkModelFnc;

    function MempoolFnc(opts) {
        return new Mempool(opts);
    }

    function FollowersModelFnc(opts) {
        return new FollowersModel(opts);
    }

    FollowersModelFnc.prototype.constructor = FollowersModelFnc;

    class FollowersModel extends Model {
        constructor(opts) {
            super(opts);
            this.diff = {};
        }
        applyUpdate(update) {
            //update = [change, timestamp, source]
            const media_name = update[0][0];
            let followers = update[0][1];

            let oldVal = this.get(media_name);
            let delta = diff.getDiff(oldVal, followers, true);

            let id, data, type = 'follow(1)';

            if (followers && delta && delta[0] && delta[0].op == 'add') { //follow: 1
                id = Object.keys(delta[0].val)[0];
                data = delta[0].val[id];
                this.diff[id] = data;
                //console.log('updater', update, data)
                //todo: merge 2 object, get new keys and check values inside.
            } else if (followers && !delta || !delta[0]) { //it mean: we have value equal old existing - follow: 0
                id = Object.keys(followers)[0];
                data = oldVal[id];
                type = 'follow(0)'
            }
            //todo: make callback here for reject/approve new values

            const payload = app.crypto.cr.pow.payloadMediaFollow(data.publicKey, app.crypto.sha256(Buffer.from(type)).toString('hex'));
            const hash2 = app.crypto.cr.pow.getHash(payload, data.time, data.nonce);
            //check signature
            const key = new HDKey()
            key.publicKey = Buffer.from(data.publicKey, 'hex');

            if (!key.verify(Buffer.from(hash2, 'hex'), Buffer.from(data.sign, 'hex'))) {
                console.log('signature is not valid');
                return false;
            }

            if (data.hash != hash2) {
                console.log('msg hash is not valid');
                return false;
            }


            //check proof
            if (!app.crypto.cr.pow.checkProof(payload, data.time, data.nonce)) {
                console.log('proof is not valid');
                return false;
            }

            //check time
            let time = Date.now() / 1000;
            if (Math.abs(data.time - time) > 12 * 60 * 60) {
                console.log('time is not valid');
                return false;
            }

            return super.applyUpdate.apply(this, arguments);
        }
    }

    class NetworkModel extends Model {
        applyUpdate(update) {
            //update = [change, timestamp, source]
            const nickname = update[0][0];
            const data = update[0][1];

            //todo: make callback here for reject/approve new state values
            if (this.get(nickname)) //already exist
                return false;


            const payload = app.crypto.cr.pow.payloadMediaCreate(nickname, data.xpub, data.publicKey)

            //check signature
            const key = HDKey.fromExtendedKey(data.xpub)

            if (!key.verify(Buffer.from(data.hash, 'hex'), Buffer.from(data.sign, 'hex'))) {
                console.log('signature is not valid');
                return false;
            }

            const hash2 = app.crypto.cr.pow.getHash(payload, data.time, data.nonce);
            if (data.hash != hash2) {
                console.log('msg hash is not valid');
                return false;
            }

            //check proof
            if (!app.crypto.cr.pow.checkProof(payload, data.time, data.nonce)) {
                console.log('proof is not valid');
                return false;
            }

            //check time
            let time = Date.now() / 1000;
            if (Math.abs(data.time - time) > 12 * 60 * 60) {
                console.log('time is not valid');
                return false;
            }

            return super.applyUpdate.apply(this, arguments);
        }
    }

    class Mempool extends Model { //can be bug here.
        applyUpdate(update) {
            const hash = update[0][0];
            const msg = update[0][1];

            if (this.get(hash))
                return false;

            //check hash
            const hash2 = app.crypto.cr.pow.getHash(msg.message, msg.time, msg.nonce);
            if (hash != hash2) {
                console.log('msg hash is not valid');
                return false;
            }

            //check proof
            if (!app.crypto.cr.pow.checkProof(msg.message, msg.time, msg.nonce)) {
                console.log('proof is not valid');
                return false;
            }

            //check time
            let time = Date.now() / 1000;
            //TODO: need remove old records from local mempool
            if (Math.abs(msg.time - time) > 24 * 60 * 60) {
                console.log('time is not valid');
                return false;
            }

            return super.applyUpdate.apply(this, arguments);
        }
    }

    class Network {

        constructor() {
            this.app = app;
        }
        createNode() {
            if (this.app.testmod && !this.app.testnetenabled)
                return;
            if (this.instance)
                throw new Error('NET Already exist');

            this.document = new ScuttleBoat({
                constructors: {
                    State: NetworkModelFnc,
                    Mempool: MempoolFnc,
                    Followers: FollowersModelFnc,
                },
            });

            this.document.add('state', 'State');
            this.document.add('mempool', 'Mempool');
            this.document.add('followers', 'Followers');


            /*this.document.on('create', (param1) => {
    console.log('create doc field', param1)
});
 
*/

            /*
            this.document.get('state').on('update', function(data, timestamp) {
                console.log('state > ', data[0] + ' = ', data[1]);
            });*/

            this.document.on('sync', () => {
                console.log('sync doc');
                //check if synced after first connection
            });

            this.document.get('followers').on('change', (key, val) => {
                console.log('change==>', key, val);
            })

            this.document.get('mempool').on('update', (data, timestamp) => {
                //new incoming message:

                let hash = data[0];
                let message = data[1];
                //check filter
                //add to cash if it is for us
                let callback = () => {
                    //add this message to local cache and do not read again
                };

                //now we must check - this message is for us or not.
                app.emit('network.message', { hash, message, callback })
            });


            this.document.get('state').on('update', (data, timestamp) => {
                //new incoming message:
                let name = data[0];
                let d = data[1];

                this.app.storage.medias.add(d.type, name, d.xpub);
            });



            //if node is server - need instance, else - it is not important.
            this.instance = net.createServer((stream) => {
                stream.pipe(this.document.createStream()).pipe(stream);
            });
            this.instance.listen(Math.floor(Math.random() * (65000 - 2048) + 2048));

            this.document.on('clientError', this.error);
            this.document.on("error", this.error);
            this.instance.on('clientError', this.error);

            return Promise.resolve(this.document);
        }
        discoveryPeers() {
            if (this.app.config.network.nodiscovery)
                return;
            if (this.app.testmod && !this.app.testnetenabled)
                return;
            const swarm = hyperswarm()
            // look for peers listed under this topic
            swarm.join(this.app.crypto.sha256('ctrlim'), {
                bootstrap: this.app.config.network.bootstrapnodes,
                lookup: this.app.config.network.lookup, // find & connect to peers if it is not server
                announce: this.app.config.network.announce // optional- announce self as a connection target
            })

            swarm.on('connection', (socket, info) => {
                console.log('new connection!');
                socket.on("error", this.error);
                socket.pipe(this.document.createStream()).pipe(socket);
                // you can now use the socket as a stream, eg:
                // process.stdin.pipe(socket).pipe(process.stdout)
            });

            app.on('beforeDestroy', () => {
                let promise = new Promise(resolve => {
                    swarm.destroy(() => {
                        resolve();
                    });
                });

                app.emit("module.destroy", { name: 'network', promise: promise });
            })

            return Promise.resolve();
        }
        error(e) {
            console.log('client error', e.code);
        }
        init() {
            return Promise.all([
                this.discoveryPeers(),
                this.createNode(),
            ]);
        }
        broadcast(hash, time, nonce, message, sign) {
            const version = app.config.network.version;
            let msg = this.document.get('mempool').get(hash);

            if (!msg)
                this.document.get('mempool').set(hash, { version, time, message, nonce, sign }); //sign is for media only.

            return Promise.resolve({ hash, time, nonce, message });
        }
        hasState(name) {
            if (Network.SYSTEMNAMES.indexOf(name) != -1)
                throw new Error('nickname can not be a system name');

            const media = this.getState(name);
            return !!media && Object.keys(media).length != 0;
        }
        setState(nickname, data, xpub, sign) {
            if (Network.SYSTEMNAMES.indexOf(nickname) != -1)
                throw new Error('nickname can not be a system name');

            this.document.get('state').set(nickname, data);

            return Promise.resolve(nickname);
        }
        getState(nickname) {

            const st = this.document.get('state');
            const nn = st.get(nickname);

            return nn;
        }
        setFollowState(media_name, data) {
            let followers = this.document.get('followers').get(media_name);
            if (!followers)
                followers = {};

            followers[data.publicKey] = data;
            this.document.get('followers').set(media_name, followers);
        }
        getFollowState(media_name, publicKeyFollower) {
            let followers = this.document.get('followers').get(media_name);
            if (!followers)
                followers = {};

            return !!followers[publicKeyFollower] && followers[publicKeyFollower] != undefined && followers[publicKeyFollower].follow;
        }
    }

    Network.SYSTEMNAMES = [];

    return Network;
}