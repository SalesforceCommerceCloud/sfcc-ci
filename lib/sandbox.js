var request = require('request');
var util = require('util');

var {table} = require('table');
var open = require('open');

var auth = require('./auth');
var instance = require('./instance');
var console = require('./log');

const API_BASE = 'admin.exp.dx.unified.demandware.net/api/v1';
const API_SANDBOXES = API_BASE + '/sandboxes';
const API_SANDBOXES_OPERATION_TIMEOUT = 1000 * 60 * 5; // 5 minutes
const AWS_SANDBOX_HOST_PATTERN = '%s-%s.sandbox.exp.dx.unified.demandware.net';
const AWS_SANDBOX_STATUS_POLL_TIMEOUT = 5000;
const AWS_SANDBOX_STATUS_UP_AND_RUNNING = 'started';
const BM_PATH = '/on/demandware.store/Sites-Site';

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

/**
 * Helper to capture most-common responses due to errors which occur across resources. In case a well-known issue
 * was identified, the function returns an Error object holding detailed information about the error. A callback
 * function can be passed optionally, the error and the response are passed as parameters to the callback function.
 *
 * @param {Object} err
 * @param {Object} response
 * @param {Function} callback
 * @return {Error} the error or null
 */
function captureCommonErrors(err, response, callback) {
    var error = null;
    if (err && !response) {
        error = new Error('The operation could not be performed properly. ' + ( process.env.DEBUG ? err : '' ));
    } else if (response.statusCode === 401) {
        error = new Error('Authorization token missing or invalid. Please (re-)authenticate first by running ' +
            '´sfcc-ci client:auth´, ´sfcc-ci client:auth:renew´ or ´sfcc-ci auth:login´');
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
        uri: 'https://' + API_SANDBOXES + path,
        auth: {
            bearer: ( token ? token : null )
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
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Retrieving list of sandboxes failed: %s', res.statusCode));
            } else if (err) {
                errback = new Error(util.format('Retrieving list of sandboxes failed: %s', err));
            }
        }
        callback(errback, body['data']);
    });
}

/**
 * Convenience function to lookup a sandbox by its alias, host or by its realm along with the instance.
 * Throws an error if there was more than one sandbox found.
 *
 * @param {Object} spec an object containing properties alias, host, realm and instance
 * @param {Object} the sandbox being looked up, or null if none was found
 */
function lookupSandbox(spec) {
    if (spec['alias']) {
        // attempt to lookup by alias
        host = instance.lookupInstance(spec['alias']);
    } else if (spec['host']) {
        // or use the passed host
        host = spec['host'];
    }

    // all sandboxes and filter them
    getAllSandboxes(function(err, list) {
        if (err) {
            throw err;
        }
        if ( list.length === 0 ) {
            return null;
        }
        var filtered = list.filter(function(cand) {
            // the host of the cand
            var candHost = getSandboxHost(cand);
            // check on filter criterias
            return ( cand.realm === spec['realm'] && cand.instance === spec['instance'] || candHost === host );
        });

        if ( filtered.length === 0 ) {
            return null;
        } else if ( filtered.length === 1 ) {
            return filtered[0];
        }

        throw new Error('Found ' + iltered.length + ' matching sandboxes');
    });
}

/**
 * Utility function to contruct the host name of the given sandbox.
 *
 * @param {Object} sandbox the sandbox
 * @return {String} the sandbox host name
 */
function getSandboxHost(sandbox) {
    return util.format(AWS_SANDBOX_HOST_PATTERN, sandbox.realm, sandbox.instance);
}

/**
 * Creates a sandbox for the passed realm.
 *
 * @param {String} realm the realm to create the sandbox for
 * @param {Function} callback the callback to execute, the error and the created sandbox are available as arguments to the callback function
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
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Creating sandbox for realm %s failed: %s (%s)', realm, body.message,
                    res.statusCode));
            } else if (err) {
                errback = new Error(util.format('Creating sandbox for realm %s failed: %s', realm, err));
            }
        }
        callback(errback, body['data']);
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
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s (%s)', body.message,
                    res.statusCode));
            } else if (err) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s', err));
            }
        }
        callback(errback, body['data']);
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
        var errback = captureCommonErrors(err, res);
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

/**
 * Utility function to pretty print an object and it's properties to the console.
 *
 * @param {Object} obj the object to pretty print
 */
function prettyPrint(obj) {
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            // in case we have an object as value
            // support pretty print its properties
            if (typeof(obj[prop]) === 'object') {
                console.log('  %s :', prop);
                for (var subp in obj[prop]) {
                    if (obj[prop].hasOwnProperty(subp)) {
                        console.log('    %s : %s', subp, obj[prop][subp]);
                    }
                }
                continue;
            } else {
                console.log('  %s : %s', prop, obj[prop]);
            }
        }
    }
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
                console.log(JSON.stringify(list));
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
     * @param {String} alias the alias to use for the created sandbox
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} sync whether to operate in synchronous mode, false by default
     * * @param {Boolean} setAsDefault optional flag to set as new default instance, false by default
     */
    create : function(realm, alias, asJson, sync, setAsDefault) {
        // memorize the start time and duration
        var startTime = Date.now();
        var duration = 0;

        createSandbox(realm, function(err, newSandbox) {
            if (err) {
                if (asJson) {
                    console.log(JSON.stringify({fault: err.message}));
                } else {
                    console.error(err.message);
                }
                process.exitCode = 1;
                return;
            }

            // the result
            var result = {
                message : util.format('Creation of new sandbox %s for realm %s triggered and ongoing. ' +
                    'Sandbox id is %s, status of sandbox is %s. You may use `sfcc-ci sandbox:list` to ' +
                    'check the status of the creation.', newSandbox.instance, newSandbox.realm, newSandbox.id,
                newSandbox.state),
                sandbox : newSandbox };

            // add to list of instances and use alias, if passed
            var newHost = getSandboxHost(newSandbox);
            var newAlias = ( alias ? alias : null);
            instance.addInstance(newHost, newAlias);

            // append to result
            result['instance'] = { instance: newHost, alias: newAlias, default: false };
            result['message'] += util.format(' New sandbox host %s added to list of instances using alias %s.',
                newHost, newAlias);

            // set new sandbox as default instance using alias, if passed
            if ( setAsDefault ) {
                instance.setDefault(newAlias);

                result['instance']['default'] = true;
                result['message'] += ' New sandbox set as default instance.';
            }

            // in async mode, just return the result of the triggering
            if (!sync) {
                if (asJson) {
                    console.log(JSON.stringify(result));
                } else {
                    console.log(result['message']);
                }
                return;
            }

            // in sync mode, read the details of the sandbox we have just triggered creation for

            // no failure
            var finished = false;
            var fault = null;

            // monitor creation and status updates until either status of new sandbox is started or operation
            // timeout has been reached
            var timeout = setInterval(function() {
                // check if operation timeout has been exceeded
                if ( Date.now() - startTime > API_SANDBOXES_OPERATION_TIMEOUT ) {
                    fault = {
                        message : 'Sandbox creation timeout has been exceeded.'
                    };
                }

                // poll the status
                if ( !fault ) {
                    getSandbox(newSandbox.id, function(err, sandbox) {
                        if (err) {
                            fault = {
                                message : err.message
                            };
                        }
                        // update the status
                        newSandbox = sandbox;
                        if (sandbox.state === AWS_SANDBOX_STATUS_UP_AND_RUNNING ) {
                            finished = true;
                        }
                    });
                }

                if (finished || fault) {
                    // update duration
                    duration = Date.now() - startTime;
                    // skip polling
                    clearInterval(timeout);

                    if (fault) {
                        // the sandbox creation was triggered, but the polling failed, don't treat this as error
                        // and just append the fault message
                        result['message'] += ' ' + fault.message;

                        if (asJson) {
                            console.log(JSON.stringify(result));
                        } else {
                            console.warn(result['message']);
                        }
                        return;
                    } else {
                        result['message'] = util.format('Creation of new sandbox %s for realm %s finished (%s ms). ' +
                            'Sandbox id is %s, status of sandbox is %s. You may use `sfcc-ci sandbox:list` to ' +
                            'check the status of the creation.', newSandbox.instance, newSandbox.realm, duration,
                        newSandbox.id, newSandbox.state);
                    }

                    // format output as JSON if needed
                    if ( asJson ) {
                        console.log(JSON.stringify(result));
                    } else if ( fault ) {
                        // or as warning, if there was a fault
                        console.warn(result['message']);
                    } else {
                        // or as plain log
                        console.log(result['message']);
                    }
                }
            }, AWS_SANDBOX_STATUS_POLL_TIMEOUT);
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
            var result = {};
            if (err) {
                result['error'] = err.message;
            }

            if (!sandbox) {
                result['error'] = util.format('Sandbox %s does not exist', id);
            }

            if ( result['err'] ) {
                if (asJson) {
                    console.error(JSON.stringify(result));
                } else {
                    console.error(result['err']);
                }
                process.exitCode = 1;
                return;
            }

            if (hostOnly) {
                result['host'] = result['instance']['instance'];
                if (asJson) {
                    console.log(JSON.stringify(result));
                } else {
                    console.log(result['host']);
                }
                return;
            }

            if (openBrowser) {
                // open BM URL in browser
                var bmUrl = 'https://' + getSandboxHost(sandbox) +
                    BM_PATH;
                console.log('Opening browser to Business Manager...');
                open(bmUrl);
                return;
            }

            // add the sandbox
            result['sandbox'] = sandbox;

            if (asJson) {
                console.log(JSON.stringify(result));
            } else {
                console.log('Sandbox details:');
                prettyPrint(sandbox);
            }
        });
    },

    /**
     * Triggers the removal of an existing sandbox. The sandbox to remove is provided by the passed sandbox spec.
     * The sandbox spec is an object holding properties to identify the sandbox, such as the id, the host, the alias,
     * the realm and the instance.
     *
     * @param {Object} spec specification of the sandbox to issue for removal
     */
    remove : function(spec) {
        // id of the sandbox to remove
        var id = null;

        if ( spec['id'] ) {
            // id provided, silently ignoring other properties
            id = spec['id'];
        } else {
            // id not provided, using other properties to lookup sandbox
            if ( !( spec['alias'] || spec['host'] || ( spec['realm'] && spec['instance'] ) ) ) {
                console.error('Provide either an alias or a realm and an instance of the sandbox.');
                process.exitCode = 1;
            }
            try {
                // try to find the sandbox
                var foundSandbox = lookupSandbox(spec);
                if ( !foundSandbox ) {
                    if (spec['alias']) {
                        console.error('Cannot find sandbox with alias %s.', spec['alias']);
                    } else if (spec['host']) {
                        console.error('Cannot find sandbox with host %s.', spec['host']);
                    } else {
                        console.error('Cannot find sandbox with realm %s and instance %s.', spec['realm'],
                            spec['instance']);
                    }
                    process.exitCode = 1;
                    return;
                }
                // and get its id
                id = foundSandbox.id;
            } catch (e) {
                console.error(e.message);
                process.exitCode = 1;
                return;
            }
        }

        if (!id) {
            console.error('Cannot remove sandbox. Sandbox id is unknown.');
            process.exitCode = 1;
            return;
        }

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