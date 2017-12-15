var request = require('request');
var util = require('util');

var {table} = require('table');
var open = require('open');

var auth = require('./auth');
var console = require('./log');

const CCDX_BASE = 'admin.exp.dx.unified.demandware.net/api/v1';
const CCDX_API_SANDBOXES = CCDX_BASE + '/sandboxes';
const CDDX_SANDBOX_HOST_PATTERN = '%s-%s.sandbox.exp.dx.unified.demandware.net';
const BM_PATH = '/on/demandware.store/Sites-Site';

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

// enable token override, workarround with hardcoded token until AM auth is fixed
if ( process.env.SFCC_CI_OAUTH_TOKEN ) {
    auth.getToken = function() {
        return process.env.SFCC_CI_OAUTH_TOKEN;
    }
}

/**
 * Helper to capture most-common responses due to errors which occur across resources. In case a well-known issue
 * was identified, the function returns an Error object holding detailed information about the error. A callback
 * function can be passed optionally, the error and the response are passed as parameters to the callback function.
 *
 * @param {Object} response
 * @param {Function} callback
 * @return {Error} the error or null
 */
function captureCommonErrors(response, callback) {
    var error = null;
    if (response.statusCode === 401) {
        error = new Error('Authorization token missing or invalid. Please (re-)authenticate first by running ' +
            '´sfcc-ci client:auth´ or ´sfcc-ci client:auth:renew´.');
    }
    // just return the error, in case no callback is passed
    if (!callback) {
        return error;
    }
    callback(error, response);
}

/**
 * Contructs the http request options and ensure shared request headers across requests, such as authentication.
 *
 * @param {String} path
 * @param {String} token
 * @param {String} method
 * @return {Object} the request options
 */
function getOptions(path, token, method) {
    var opts = {
        uri: 'https://' + CCDX_API_SANDBOXES + path,
        auth: {
            bearer: token
        },
        strictSSL: false,
        method: method,
        json: true
    };
    return opts;
}

/**
 * Retrieves all known sandboxes and returns them as array.
 *
 * @param {Function} callback the callback to execute, the error and the list of sandboxes are available as arguments to the callback function
 */
function getAllSandboxes(callback) {
    // build the request options
    var options = getOptions('', auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Retrieving list of sandboxes failed: %s', res.statusCode));
            } else if (err) {
                errback = new Error(util.format('Retrieving list of sandboxes failed: %s', err));
            }
        }
        callback(errback, body);
    });
}

/**
 * Creates a sandbox for the passed realm.
 *
 * @param {String} realm the realm to create the sandbox for
 * @param {Function} callback the callback to execute, the error and the result details are available as arguments to the callback function
 */
function createSandbox(realm, callback) {
    // build the request options
    var options = getOptions('', auth.getToken(), 'POST');

    // the payload
    options['body'] = {
        realm : realm
    };

    // do the request
    request.post(options, function (err, res, body) {
        var errback = captureCommonErrors(res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Creating sandbox for realm %s failed: %s (%s)', realm, body.message,
                    res.statusCode));
            } else if (err) {
                errback = new Error(util.format('Creating sandbox for realm %s failed: %s', realm, err));
            }
        }
        callback(errback, body);
    });
}

/**
 * Retrieves details of a single sandboxes by id.
 *
 * @param {Function} callback the callback to execute, the error and the sandbox details are available as arguments to the callback function
 */
function getSandbox(id, callback) {
    // build the request options
    var options = getOptions('/' + id, auth.getToken(), 'GET');

    // do the request
    request.get(options, function (err, res, body) {
        var errback = captureCommonErrors(res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s (%s)', body.message,
                    res.statusCode));
            } else if (err) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s', err));
            }
        }
        callback(errback, body);
    });
}

/**
 * Removes a sandbox by id
 *
 * @param {String} id the id of the sandbox to remove
 * @param {Function} callback the callback to execute, the error and the result details are available as arguments to the callback function
 */
function removeSandbox(id, callback) {
    // build the request options
    var options = getOptions('/' + id, auth.getToken(), 'DELETE');

    // do the request
    request.delete(options, function (err, res, body) {
        var errback = captureCommonErrors(res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Removing sandbox failed: %s (%s)', body.message, res.statusCode));
            } else if (err) {
                errback = new Error(util.format('Removing sandbox failed: %s', err));
            }
        }
        callback(errback, body);
    });
}

module.exports.cli = {
    /**
     * List all sandboxes currently created and renders them in the console.
     *
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    list : function(asJson) {
        getAllSandboxes(function(err, list) {
            if (err) {
                console.error(err.message);
                process.exitCode = 1;
                return;
            }

            if (asJson) {
                console.log(list);
                return;
            }

            if (list.length === 0) {
                console.log('No sandboxes found');
                return;
            }

            // table fields
            var data = [['ID','Realm','Instance','Version','State','Created At','Created By']];
            for (var i of list) {
                data.push([i.id,i.realm,i.instance,i.versions.app,i.state,i.createdAt,i.createdBy]);
            }

            console.log(table(data, {
                columns: {
                    0: {width:36},
                    1: {width:6},
                    2: {width:10},
                    3: {width:10},
                    4: {width:10},
                    5: {width:25},
                    6: {width:25}
                }
            }));
        });
    },

    /**
     * Triggers the creation of a new sandbox. The sandbox will be created for the realm passed by id.
     *
     * @param {String} realm the realm to create the sandbox in
     */
    create : function(realm) {
        createSandbox(realm, function(err, details) {
            if (err) {
                console.error(err.message);
                process.exitCode = 1;
                return;
            }
            console.log('Creation of new sandbox for realm %s triggered. You may use `sfcc-ci sandbox:list` ' +
                'to check the status of the creation.', realm);
        });
    },

    /**
     * Retrieves details of a single sandboxes by id and renders them in the console.
     *
     * @param {String} id sandbox id to lookup
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} hostOnly optional flag to return the well-defined host name of the sandbox, false by default
     * @param {Boolean} openBrowser optional flag to open a browser to the Business Manager, false by default
     */
    get : function(id, asJson, hostOnly, openBrowser) {
        getSandbox(id, function(err, sandbox) {
            if (err) {
                console.error(err.message);
                process.exitCode = 1;
                return;
            }

            if (!sandbox) {
                console.error('Sandbox %s does not exist', id);
                return;
            }

            if (hostOnly) {
                console.log(util.format(CDDX_SANDBOX_HOST_PATTERN, sandbox.realm, sandbox.instance));
                return;
            }

            if (openBrowser) {
                // open BM URL in browser
                var bmUrl = 'https://' + util.format(CDDX_SANDBOX_HOST_PATTERN, sandbox.realm, sandbox.instance) +
                    BM_PATH;
                console.log('Opening browser to Business Manager...');
                open(bmUrl);
                return;
            }

            // simply dump the details
            console.log(sandbox);
        });
    },

    /**
     * Triggers the removal of an existing sandbox. The sandbox to remove is provided by the passed id.
     *
     * @param {String} id the id of the sandbox to issue for removal
     */
    remove : function(id) {
        removeSandbox(id, function(err, body) {
            if (err) {
                console.error(err.message);
                process.exitCode = 1;
                return;
            }
            console.log('Removal for sandbox %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                'status of the removal.', id);
        });
    }
}