var chalk = require('chalk');

const warn = chalk.yellow;
const error = chalk.red;

module.exports.log = function() {
    console.log.apply(null, arguments);
};

module.exports.warn = function() {
    arguments[0] = warn('Warning:', arguments[0]);
    console.warn.apply(null, arguments);
}

module.exports.error = function() {
    arguments[0] = error('Error:', arguments[0]);
    console.error.apply(null, arguments);
}