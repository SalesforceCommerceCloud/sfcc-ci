var chalk = require('chalk');
var { table } = require('table');

const warn = chalk.yellow;
const error = chalk.red;
const info = chalk.gray;
const debug = chalk.cyan;

// debug in cyan
module.exports.debug = function() {
    arguments[0] = debug('[DEBUG]', arguments[0]);
    console.log.apply(null, arguments);
};

// plain standard logging without colors
module.exports.log = function() {
    console.log.apply(null, arguments);
};

// info in gray
module.exports.info = function() {
    arguments[0] = info(arguments[0]);
    console.log.apply(null, arguments);
};

// warn in yellow
module.exports.warn = function() {
    arguments[0] = warn('Warning:', arguments[0]);
    console.warn.apply(null, arguments);
}

// error in red
module.exports.error = function() {
    arguments[0] = error('Error:', arguments[0]);
    console.error.apply(null, arguments);
}

// tables in gray
module.exports.table = function() {
    console.log(info(table(arguments[0], {})));
}