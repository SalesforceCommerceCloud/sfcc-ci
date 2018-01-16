var config = {};

var dwjson = (function() {
    var loaded = {};
    try {
        loaded = require(process.cwd() + '/dw.json');
        if (process.env.DEBUG) {
            console.log('Configuration loaded from %s', process.cwd() + '/dw.json');
        }
    } catch (e) {
        if (e instanceof Error && e.code === 'MODULE_NOT_FOUND') {
            if (process.env.DEBUG) {
                console.log('No dw.json found in %s', process.cwd());
            }
        } else {
            throw e;
        }
    }
    return {};
})();

var properties = ['hostname', 'username', 'password', 'cartridge', 'code-version',
    'client-id','client-secret','self-signed', 'account-manager'];

properties.forEach((property) => {
    Object.defineProperty(config, property, { get: () => dwjson[property] });
});

module.exports.init = function() {
    return config;
}