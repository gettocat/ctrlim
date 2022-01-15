const BloomFilter = require('bloom-filter');
const bitPony = require('bitpony');
const crypto = require('crypto');

module.exports = (app) => {

    bitPony.extend('filter', function() {
        return {
            read: function(buffer) {
                if (typeof buffer == 'string')
                    buffer = Buffer.from(buffer, 'hex')

                if (buffer.length == 0 || !buffer)
                    buffer = Buffer.from([0x0]);

                let offset = 0,
                    stream = new bitPony.reader(buffer);
                let res = stream.var_int(offset);
                let count = res.result,
                    vData = [],
                    nHashFuncs, nTweak, nFlags;

                offset = res.offset;
                for (let i = 0; i < count; i++) {
                    res = stream.uint8(offset)
                    vData.push(res.result);
                    offset = res.offset;
                }

                res = stream.uint32(offset);
                nHashFuncs = res.result;
                offset = res.offset;

                res = stream.uint32(offset);
                nTweak = res.result;
                offset = res.offset;

                res = stream.uint8(offset);
                nFlags = res.result;
                offset = res.offset;

                return {
                    nFlags: nFlags,
                    nHashFuncs: nHashFuncs,
                    nTweak: nTweak,
                    vData: vData
                }
            },
            write: function(vData, nHashFuncs, nTweak, nFlags) {
                let len = vData.length;
                let writer = new bitPony.writer(Buffer.from(""));
                writer.var_int(len, true);
                for (let i in vData) {
                    writer.uint8(vData[i], true);
                }

                writer.uint32(nHashFuncs, true);
                writer.uint32(nTweak, true);
                writer.uint8(nFlags, true);
                return writer.getBuffer().toString('hex')
            },
        }
    });


    class filter {
        constructor(options) {
            this.filter = new BloomFilter(options);
        }
        contain(key) {
            return this.filter.contains(Buffer.from(key, 'hex'));
        }
        containObject(data, fields) {
            for (let i in fields) {
                let res = this.contain(Buffer.from(data[i], 'hex'));
                if (res)
                    return true;
            }

            return false;
        }
        static noise(num) {
            if (!num)
                return [];

            if (num < 2)
                num = 12;

            let s = [];

            for (let i = 0; i < num; i++) {
                s.push(crypto.randomBytes(32).toString('hex'));
            }

            return s;
        }
        static create(list, falsePositiveRate) {
            if (!falsePositiveRate)
                falsePositiveRate = 0.01;

            let filter = BloomFilter.create(list.length, falsePositiveRate);
            for (let i in list) {
                filter.insert(Buffer.from(list[i], 'hex'));
            }

            const serialized = filter.toObject();
            return bitPony.filter.write(serialized.vData, serialized.nHashFuncs, serialized.nTweak, serialized.nFlags).toString('hex');
        }
        static load(bufferOrHex) {
            let data = bitPony.filter.read(bufferOrHex);
            let f = new filter(data);
            return f;
        }
    }


    return filter;
}