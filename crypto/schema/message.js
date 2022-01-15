const bitPony = require('bitpony');

module.exports = (app) => {

    class Schema {
        constructor() {
            //this.TextMessage = TextMessage;
        }
        static getType(buffer) {
            let json = Schema.readJSON(buffer);
            return json['#'];
        }
        static readJSON(buffer) {
            return JSON.parse(Buffer.from(buffer, 'hex').toString('utf8'))
        }
        static getContent(buffer) {
            return Schema.read(buffer).getContent();
        }
        static read(buffer) {
            if (typeof buffer == 'string' && buffer == '#invalid') {
                return new InvalidMessage();
            }

            let json = Schema.readJSON(buffer);
            let obj = json['#'];

            let cls_ = this[obj];
            if (!cls_)
                throw new Error('invalid schema object in read');
            let f = new cls_(-1);
            f.unpack(json);

            return f;
        }
        static create(type, ...others) {
            return new type(...others);
        }
    }

    class Type {
        constructor(typename, schema_version) {
            this.typename = typename;
            this.version = schema_version || app.SCHEMA;
        }
        pack() {
            return {
                '#': this.typename,
                'v': this.version
            }
        }
        unpack(json) {

        }
        getContent() {
            return "";
        }
    }

    class TextMessage extends Type {
        constructor(buffer, version) {
            super('TextMessage', version);
            if (buffer != -1) {
                this.content = buffer;
                this.version = version || 1;
            }
        }
        pack() {
            return Buffer.from(JSON.stringify({
                '#': this.typename,
                'v': this.version,
                'content': Buffer.from(this.content).toString('utf8')
            }))
        }
        unpack(buffer) {
            if (buffer instanceof Buffer || typeof buffer == 'string') {
                let json = JSON.parse(Buffer.from(buffer).toString('utf8'));
                this.content = Buffer.from(json.content).toString('utf8');
                this.version = json.v || 1;
            } else if (buffer instanceof Object) {
                this.content = Buffer.from(buffer.content).toString('utf8');
                this.version = buffer.v || 1;
            }
        }
        getContent() {
            return this.content;
        }
        getVersion() {
            return this.version;
        }
    }

    class InvalidMessage extends Type {
        constructor(version) {
            super('InvalidMessage', version);
            if (version != -1) {
                this.content = "";
                this.version = version || 1;
            }
        }
        pack() {
            return Buffer.from(JSON.stringify({
                '#': "InvalidMessage",
                'v': this.version,
                'content': ""
            }))
        }
        unpack(buffer) {
            this.content = "";
            this.version = buffer.v || 1;
        }
        getContent() {
            return "";
        }
        getVersion() {
            return this.version;
        }
    }

    class FollowMessage extends Type {
        constructor(publicKey, sign, version) {
            super('FollowMessage', version);
            if (publicKey != -1) {
                this.publicKey = publicKey;
                this.sign = sign;
                this.version = version || 1;
            }
        }
        pack() {
            return Buffer.from(JSON.stringify({
                '#': this.typename,
                'v': this.version,
                'pk': Buffer.from(this.publicKey, 'hex').toString('hex'),
                's': Buffer.from(this.sign, 'hex').toString('hex')
            }))
        }
        unpack(buffer) {
            if (buffer instanceof Buffer || typeof buffer == 'string') {
                let json = JSON.parse(Buffer.from(buffer).toString('utf8'));
                this.sign = Buffer.from(json.s, 'hex').toString('hex');
                this.publicKey = Buffer.from(json.pk, 'hex').toString('hex');
                this.version = json.v || 1;
            } else if (buffer instanceof Object) {
                this.sign = Buffer.from(buffer.s, 'hex').toString('hex');
                this.publicKey = Buffer.from(buffer.pk, 'hex').toString('hex');
                this.version = buffer.v || 1;
            }
        }
        getContent() {
            return {
                'publicKey': this.publicKey,
                'sign': this.sign
            };
        }
        getVersion() {
            return this.version;
        }
    }

    class UnfollowMessage extends Type {
        constructor(sign, version) {
            super('UnfollowMessage', version);
            if (sign != -1) {
                this.publicKey = 0;
                this.sign = sign;
                this.version = version || 1;
            }
        }
        pack() {
            return Buffer.from(JSON.stringify({
                '#': this.typename,
                'v': this.version,
                's': Buffer.from(this.sign, 'hex').toString('hex')
            }))
        }
        unpack(buffer) {
            if (buffer instanceof Buffer || typeof buffer == 'string') {
                let json = JSON.parse(Buffer.from(buffer).toString('utf8'));
                this.sign = Buffer.from(json.s, 'hex').toString('hex');
                this.version = json.v || 1;
            } else if (buffer instanceof Object) {
                this.sign = Buffer.from(buffer.s, 'hex').toString('hex');
                this.version = buffer.v || 1;
            }
        }
        getContent() {
            return {
                'publicKey': 0,
                'sign': this.sign
            };
        }
        getVersion() {
            return this.version;
        }
    }

    Schema.Names = {
        'InvalidMessage': 0,
        'TextMessage': 1,
        'FollowMessage': 2,
        'UnfollowMessage': 3,
    };

    Schema.TextMessage = TextMessage;
    Schema.InvalidMessage = InvalidMessage;
    Schema.FollowMessage = FollowMessage;
    Schema.UnfollowMessage = UnfollowMessage;

    return Schema;

}