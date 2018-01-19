var chalk = require('chalk');

const warn = chalk.yellow;
const error = chalk.red;

/**
 * Utility function to pretty print an object and it's properties to the console.
 *
 * @param {Object} obj the object to pretty print
 * @param {String} offset the offset used to log to the console, by default it is '  '
 */
function prettyPrint(obj, offset) {
    if ( !offset ) {
        offset = '  ';
    }
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            // in case we have an object as value
            // support pretty print its properties
            if (typeof(obj[prop]) === 'object') {
                console.log('%s%s :', offset, prop);
                prettyPrint(obj[prop], offset + '  ');
                continue;
            } else if (prop.indexOf('_') !== 0) {
                // only log non-OCAPI internal properties
                console.log('%s%s : %s', offset, prop, obj[prop]);
            }
        }
    }
}

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

module.exports.prettyPrint = prettyPrint;