
module.exports = (app, parent) => {

    class TextMessage extends parent {
        constructor(buffer, version) {
            super('TextMessage', version);
            if (buffer != -1) {
                this.content = buffer;
                this.version = version || 1;
            }
        }
    }

    app['text'] = TextMessage;


    app.buildMessage = (type, bufferOrString, options) => {
        if (!options)
            options = {};

        if (['text', 'vote', 'poll'].indexOf(type) == -1)//todo pic, video, link etc
            type = 'text';
        return new app[type](Buffer.from(bufferOrString), options.version || 1).pack();
    }

}