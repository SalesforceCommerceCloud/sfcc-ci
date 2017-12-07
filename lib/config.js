var Conf = require('conf');

// create a Conf instance
var conf = new Conf();

// return an instance of Configstore
module.exports.obtain = function() {
    return conf;
}