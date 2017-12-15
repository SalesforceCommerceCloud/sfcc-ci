var config = {};

function lazyload() {
    if (config || config === {}) {
        config = require(dependencies.process.cwd() + '/dw.json');
    }
    return config;
}
var properties = ['hostname', 'username', 'password', 'cartridge', 'code-version',
    'client-id','client-secret','self-signed', 'account-manager'];

properties.forEach((property) => {
    Object.defineProperty(config, property, { get: () => lazyload()[property] });
});

module.exports.init = function(externalDependencies) {
    dependencies = externalDependencies;
    return config;
}