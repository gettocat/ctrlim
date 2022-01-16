it('should fire event wrongpassword', function (done) {
    const CONTROL = require('../index');

    ctrl = new CONTROL({}, 't43yh5teweg43y54u6jytm');
    ctrl.on('wrongpassword', () => {
        console.log('it is a wrong password to db and seed');
        done();
    })
    ctrl.on('init', () => {
        console.log('inited');
        done('error, password is right')
    })


});