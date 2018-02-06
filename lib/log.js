var chalk = require('chalk');
var { table } = require('table');

const warn = chalk.yellow;
const error = chalk.red;
const info = chalk.gray;
const debug = chalk.cyan;

/**
 * Utility function to deep filter the passed object and to remove property names starting with _
 *
 * @param {Object} obj the object to filter
 * @return {Object} the filtered object
 */
function deepFilter(obj) {
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            // delete property if needed
            if (prop.indexOf('_') === 0) {
                delete obj[prop];
                // and continue with next property
                continue;
            }
            // if we have an object as value
            // support filtering its properties further
            if (typeof(obj[prop]) === 'object') {
                obj[prop] = deepFilter(obj[prop]);
                continue;
            }
        }
    }
    // finally return the filtered object
    return obj;
}

// debug in cyan
module.exports.debug = function() {
    // log only, if running in debug mode
    if (process.env.DEBUG && arguments[0]) {
        arguments[0] = debug('[DEBUG]', arguments[0]);
        console.log.apply(null, arguments);
    }
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

    // set proper exit code in case of errors
    process.exitCode = 1;
}

// tables in gray
module.exports.table = function() {
    console.log(info(table(arguments[0], {})));
}

// json in plain
module.exports.json = function() {
    // the object to output
    var obj = arguments[0];
    if (typeof(obj) !== 'object') {
        throw new Error('First argument is not an object');
    }

    // deep filter any properties starting with _
    obj = deepFilter(obj);

    // filter any debug info, if not in debug mode
    if (!process.env.DEBUG) {
        delete obj['debug'];
    }

    // log to console
    console.log(JSON.stringify(obj));

    // set proper exit code in case of errors
    if ( obj['error'] ) {
        process.exitCode = 1;
    }
}