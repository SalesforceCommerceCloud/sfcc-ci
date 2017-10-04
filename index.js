// make the APIs publicly available
exports.auth = require('./lib/auth').api;
exports.instance = require('./lib/instance').api;
exports.code = require('./lib/code').api;
exports.job = require('./lib/job').api;