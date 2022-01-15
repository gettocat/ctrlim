const BN = require('bn.js');
class PoW {

    constructor(app) {
        this.app = app;
    }
    init() {
        return Promise.resolve();
    }
    createTemplate(message, time) {
        return Buffer.concat([
            this.app.crypto.sha256(message),
            new BN(time).toBuffer()
        ]);
    }
    getHash(message, time, nonce) {
        const template = this.createTemplate(message, time);
        return this.app.crypto.sha256d(Buffer.concat([
            template,
            new BN(nonce).toBuffer()
        ]), 'hex');
    }
    checkProof(message, time, nonce) {

        return this.getAverageMempoolProof(time)
            .then(diff => {

                const template = this.createTemplate(message, time);
                console.log('template:', template, new BN(nonce).toBuffer())
                const hash = this.app.sha256d(Buffer.concat([
                    template,
                    new BN(nonce).toBuffer()
                ]), 'hex');

                const i = new BN(hash, 16).imul(new BN(diff));
                const maxTarget = new BN(2).pow(new BN(250)).sub(new BN(1));
                const minTarget = new BN(2).pow(new BN(128)).sub(new BN(1));
                return Promise.resolve(i.lt(maxTarget) && i.gte(minTarget));

            })
    }
    createProof(message, time) {
        if (!time)
            time = Math.floor(Date.now() / 1000);

        return this.getAverageMempoolProof(time)
            .then(diff => {

                const maxTarget = new BN(2).pow(new BN(255)).sub(new BN(1));
                const minTarget = new BN(2).pow(new BN(128)).sub(new BN(1));

                const template = this.createTemplate(message, time);

                const diffBN = new BN(diff);

                let nonce = 0;
                while (true) {
                    let hash = this.app.crypto.sha256(Buffer.concat([
                        template,
                        new BN(nonce).toBuffer()
                    ]), 'hex');

                    let i = new BN(hash, 16).imul(diffBN);

                    if (i.lt(maxTarget) && i.gte(minTarget)) {
                        return Promise.resolve({
                            hash: hash.toString('hex'),
                            time,
                            nonce,
                            diff
                        })
                    }

                    nonce++;
                }
            })


    }
    getLastMempoolPeriod(period, from) {

        return new Promise(resolve => {
            this.app.emit('NET:getMempoolHistory', (history) => {
                if (!from)
                    from = Date.now() / 1000;
                if (!period)
                    period = this.app.config.proof.period || 3600;

                const start = from;
                const end = start - period;

                let times = [];
                //every call we make enum and sort. TODO: optimization for bigdata!
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i] >= end && history[i] <= start) {
                        times.push(history[i]);
                    }
                }

                resolve(times)
            })
        })

    }
    getAverageMempoolProof(from) {
        return this.getLastMempoolPeriod(this.app.config.proof.period, from)
            .then(times => {
                const N = times.length;
                const min = Math.min.apply(Math, times);
                const max = Math.max.apply(Math, times);
                const pow_start = this.app.config.proof.target;
                const okay_capacity = this.app.config.proof.capacity; //100 messages per second is okay for now
                const capacity = N / (max - min + 1) / 60 * 60;
                let AvgProof = Math.floor(pow_start + capacity / okay_capacity);
                if (AvgProof < 10)
                    AvgProof = 10;

                return Promise.resolve(AvgProof);
            })
    }

    //payload types
    payloadMediaCreate(name, xpub, publicKey) {
        return Buffer.concat([
            Buffer.from(name),
            Buffer.from(xpub),
            Buffer.from(publicKey, 'hex'),
        ]);
    }
    payloadMediaFollow(subscriber_publicKey, signingPayload) {
        return Buffer.concat([
            Buffer.from(subscriber_publicKey, 'hex'),
            Buffer.from(signingPayload, 'hex'),
        ]);
    }
    payloadMediaBroadcast(mediaPublicKey, hashOfEncryptedPayload) {
        return Buffer.concat([
            Buffer.from(mediaPublicKey, 'hex'),
            Buffer.from(hashOfEncryptedPayload, 'hex'),
        ]);
    }
}

module.exports = PoW;