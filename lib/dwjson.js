var config = {};

function lazyload() {
    if (config) {
        config = require(dependencies.process.cwd() + '/dw.json');
    }
    return config;
}

var properties = ['hostname', 'username', 'password', 'cartridge', 'code-version', 'client-id','client-secret'];

properties.forEach(function(property) {
    Object.defineProperty(config, property, {
        get: function () {
            return lazyload()[property];
        }
    });
});

module.exports.init = function(externalDependencies) {
    dependencies = externalDependencies;
    return config;
}