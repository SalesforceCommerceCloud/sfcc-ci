var console = require('./log');

var config = {};

var dwjson = (function() {
    var loaded = {};
    try {
        loaded = require(process.cwd() + '/dw.json');
        console.debug('Configuration loaded from %s', process.cwd() + '/dw.json');
    } catch (e) {
        if (e instanceof Error && e.code === 'MODULE_NOT_FOUND') {
            console.debug('No dw.json found in %s', process.cwd());
        } else {
            console.error('Cannot load dw.json file: %s', e.message);
        }
    }
    return loaded;
})();

var properties = ['hostname', 'username', 'password', 'cartridge', 'code-version',
    'client-id','client-secret','self-signed', 'account-manager'];

properties.forEach((property) => {
    Object.defineProperty(config, property, { get: () => dwjson[property] });
});

module.exports.init = function() {
    return config;
}