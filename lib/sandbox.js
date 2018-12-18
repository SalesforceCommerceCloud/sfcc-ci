var request = require('request');
var util = require('util');

var {table} = require('table');
var open = require('open');

var auth = require('./auth');
var instance = require('./instance');
var console = require('./log');
var dwjson = require('./dwjson').init();

const API_HOST_DEFAULT = 'admin.us01.dx.commercecloud.salesforce.com';
const API_HOST = getAPIHost();
const API_BASE = API_HOST + '/api/v1';
const API_SANDBOXES = API_BASE + '/sandboxes';
const API_SANDBOXES_OPERATION_TIMEOUT = 1000 * 60 * 10; // 10 minutes
const SANDBOX_HOST_PATTERN = '%s-%s.sandbox.us01.dx.commercecloud.salesforce.com';
// ocapi settings to apply to sandbox at provisioning time, CLIENTID to be set beforehand
const SANDBOX_OCAPI_SETTINGS = [{ client_id: "CLIENTID",
    resources: [
        { resource_id: "/code_versions", methods: ["get"], read_attributes: "(**)", write_attributes: "(**)" },
        { resource_id: "/code_versions/*", methods: ["patch"], read_attributes: "(**)", write_attributes: "(**)" },
        { resource_id: "/jobs/*/executions", methods: ["post"], read_attributes: "(**)", write_attributes: "(**)" },
        { resource_id: "/jobs/*/executions/*", methods: ["get"], read_attributes: "(**)", write_attributes: "(**)" }
    ]
}];
// webdav permissions to apply to sandbox at provisioning time, CLIENTID to be set beforehand
const SANDBOX_WEBDAV_PERMISSIONS = [{ client_id: "CLIENTID",
    permissions: [
        { path: "/impex", operations: ["read_write"] },
        { path: "/cartridges", operations: ["read_write"] }
    ]
}];

const SANDBOX_STATUS_POLL_TIMEOUT = 5000;
const SANDBOX_STATUS_POLL_ERROR_THRESHOLD = 3;
const SANDBOX_STATUS_UP_AND_RUNNING = 'started';
const SANDBOX_STATUS_FAILED = 'failed';
const BM_PATH = '/on/demandware.store/Sites-Site';

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

/**
 * Utility function to lookup the sandbox API host name. By default it is the host name
 * defined as API_HOST_DEFAULT. The default API host can be overwritten using the environment
 * variable SFCC_SANDBOX_API_HOST.
 *
 * @return {String} the API host name
 */
function getAPIHost() {
    // check on env var and return it if set
    if ( process.env.SFCC_SANDBOX_API_HOST ) {
        console.debug('Using alternative sandbox API host %s defined in env var `SFCC_SANDBOX_API_HOST`',
            process.env.SFCC_SANDBOX_API_HOST);
        return process.env.SFCC_SANDBOX_API_HOST;
    }
    // return the default host otherwise
    return API_HOST_DEFAULT;
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
        error = new Error('Authorization invalid. Please (re-)authenticate first by running ' +
            '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´');
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
        uri: 'https://' + path,
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
 * Retrieves all realms and returns them as array.
 *
 * @param {Function} callback the callback to execute, the error and the list of realms are available as arguments to the callback function
 */
function getRealms(callback) {
    // build the request options
    var options = getOptions(API_BASE + '/me', auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Getting realms failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting realms failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, body['data']['realms']);
    });
}

/**
 * Retrieves detals of a realm.
 *
 * @param {String} realmID the id of the realm
 * @param {Function} callback the callback to execute, the error and the realm are available as arguments to the callback function
 */
function getRealm(realmID, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/realms/' + realmID, auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Getting realm failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting realm failed: %s', res.statusCode)));
            return;
        }

        // do quota request
        var options = getOptions(API_BASE + '/realms/' + realmID + '/quota', auth.getToken(), 'GET');
        request(options, function (err, res, bodyQuota) {
            var errback = captureCommonErrors(err, res);
            if ( errback ) {
                callback(errback, []);
                return;
            } else if ( err ) {
                callback(new Error(util.format('Getting realm failed: %s', err)), []);
                return;
            } else if ( res.statusCode >= 400 ) {
                callback(new Error(util.format('Getting realm failed: %s', res.statusCode)));
                return;
            }

            // do the callback with merged results into one object
            callback(undefined, Object.assign(body['data'], bodyQuota['data']));
        });
    });
}

/**
 * Retrieves all known sandboxes and returns them as array.
 *
 * @param {Function} callback the callback to execute, the error and the list of sandboxes are available as arguments to the callback function
 */
function getAllSandboxes(callback) {
    // build the request options
    var options = getOptions(API_SANDBOXES, auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        var list = [];
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Retrieving list of sandboxes failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Retrieving list of sandboxes failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, body['data']);
    });
}

/**
 * Convenience function to lookup a sandbox by its alias, host or by its realm along with the instance.
 * Throws an error if there was more than one sandbox found.
 *
 * @param {Object} spec an object containing properties alias, host, realm and instance
 * @param {Function} callback callback function with err and the sandbox as parameters passed
 */
function lookupSandbox(spec, callback) {
    var host = null;
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
            callback(err);
            return;
        }
        if ( list.length === 0 ) {
            callback(undefined, null);
            return;
        }
        var filtered = list.filter(function(cand) {
            // the host of the cand
            var candHost = getSandboxHost(cand);
            // check on filter criterias
            return ( cand.id === spec['id'] || cand.realm === spec['realm'] && cand.instance === spec['instance'] ||
                candHost === host );
        });

        if ( filtered.length === 0 ) {
            callback(undefined, null);
            return;
        } else if ( filtered.length === 1 ) {
            callback(undefined, filtered[0]);
            return;
        }

        callback(new Error('Found ' + filtered.length + ' matching sandboxes'));
    });
}

/**
 * Utility function to contruct the host name of the given sandbox.
 *
 * @param {Object} sandbox the sandbox
 * @return {String} the sandbox host name
 */
function getSandboxHost(sandbox) {
    return util.format(SANDBOX_HOST_PATTERN, sandbox.realm, sandbox.instance);
}

/**
 * Creates a sandbox for given realm. Realm ID can be passed as parameter or provided dw.json file located in the current working directory.
 *
 * @param {String} realm the realm to create the sandbox for
 * @param {String} ttl the ttl of the sandbox in hours
 * @param {Function} callback the callback to execute, the error and the created sandbox are available as arguments to the callback function
 */
function createSandbox(realm, ttl, callback) {
    if (!realm && dwjson['realm']) {
        realm = dwjson['realm'];
        console.info('Using realm id %s from dw.json at %s', dwjson['realm'], process.cwd());
    }
    // build the request options
    var options = getOptions(API_SANDBOXES, auth.getToken(), 'POST');

    // prep initial ocapi settings
    var ocapiSettings = SANDBOX_OCAPI_SETTINGS;
    ocapiSettings[0]['client_id'] = auth.getClient();

    // prep initial webdav permissions
    var webdavPermissions = SANDBOX_WEBDAV_PERMISSIONS;
    webdavPermissions[0]['client_id'] = auth.getClient();

    // the payload
    options['body'] = {
        realm : realm,
        settings : {
            ocapi : ocapiSettings,
            webdav : webdavPermissions
        }
    };

    // the ttl, if passed
    if (ttl) {
        options['body']['ttl'] = ttl;
    }

    // do the request
    request.post(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Creating sandbox for realm %s failed: %s', realm,
                    body.error.message));
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
    var options = getOptions(API_SANDBOXES + '/' + id, auth.getToken(), 'GET');

    // do the request
    request.get(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s', body.message));
            } else if (err) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s', err));
            }
        }
        callback(errback, body['data']);
    });
}

/**
 * Update sandbox details
 *
 * @param {String} id the sandbox update
 * @param {Number} ttl the ttl to update (value will not overwrite the existing ttl, but added to the ttl = prolonged)
 * @param {Function} callback the callback to execute, the error and the sandbox details are available as arguments to the callback function
 */
function updateSandbox(id, ttl, callback) {
    // build the request options
    var options = getOptions(API_SANDBOXES + '/' + id, auth.getToken(), 'PATCH');

    // the ttl, if passed
    if (ttl) {
        options['body'] = {
            'ttl' : ttl
        };
    }

    // do the request
    request.patch(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Updating sandbox failed: %s', body.message));
            } else if (err) {
                errback = new Error(util.format('Updating sandbox failed: %s', err));
            }
        }
        callback(errback, body['data']);
    });
}

/**
 * Delete a sandbox by id
 *
 * @param {String} id the id of the sandbox to delete
 * @param {Function} callback the callback to execute, the error and the result details are available as arguments to the callback function
 */
function removeSandbox(id, callback) {
    // build the request options
    var options = getOptions(API_SANDBOXES + '/' + id, auth.getToken(), 'DELETE');

    // do the request
    request.delete(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Removing sandbox failed: %s', body.message));
            } else if (err) {
                errback = new Error(util.format('Removing sandbox failed: %s', err));
            }
        }
        callback(errback, body);
    });
}

/**
 * Trigger the given operation on a sandbox.
 *
 * @param {String} id the id of the sandbox to trigger the operation on
 * @param {String} operation the operation to trigger (one of: start, stop, restart, reset)
 * @param {Function} callback the callback to execute, the error and the result details are available as arguments to the callback function
 */
function triggerOperation(id, operation, callback) {
    // build the request options
    var options = getOptions(API_SANDBOXES + '/' + id + '/operation', auth.getToken(), 'POST');

    // the payload
    options['body'] = {
        operation : operation
    };

    // do the request
    request.post(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Operation failed: %s', body.error.message));
            } else if (err) {
                errback = new Error(util.format('Operation failed: %s', err));
            }
        }
        callback(errback, body);
    });
}

module.exports.cli = {
    /**
     * Lists all realms eligible to manage sandboxes for.
     *
     * @param {String} realm the realm id or null if all realms should be returned
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of sandboxes by
     */
    realms : function(realm, asJson, sortBy) {
        // get details of a single realm if realm id was passed
        if ( typeof(realm) !== 'undefined' && realm !== null ) {
            getRealm(realm, function(err, result) {
                if (err) {
                    console.error(err.message);
                    return;
                }

                if (asJson) {
                    console.json(result);
                    return;
                }

                console.prettyPrint(result);
            });
            return;
        }
        // get all realms
        getRealms(function(err, list) {
            if (err) {
                console.error(err.message);
                return;
            }

            if (sortBy) {
                list = require('./json').sort(list, sortBy);
            }

            if (asJson) {
                console.json(list);
                return;
            }

            if (list.length === 0) {
                console.info('No realms found');
                return;
            }

            // table fields
            var data = [['Realm']];
            for (var i of list) {
                data.push([i]);
            }

            console.table(data);
        });
    },

    /**
     * List all sandboxes currently created and renders them in the console.
     *
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of sandboxes by
     */
    list : function(asJson, sortBy) {
        getAllSandboxes(function(err, list) {
            if (err) {
                console.error(err.message);
                return;
            }

            if (sortBy) {
                list = require('./json').sort(list, sortBy);
            }

            if (asJson) {
                console.json(list);
                return;
            }

            if (list.length === 0) {
                console.info('No sandboxes found');
                return;
            }

            // table fields
            var data = [['id','realm','instance','version','state','createdAt','eol','createdBy']];
            for (var i of list) {
                data.push([i.id,i.realm,i.instance,i.versions.app,i.state,i.createdAt,i.eol,i.createdBy]);
            }

            console.table(data);
        });
    },

    /**
     * Triggers the creation of a new sandbox. The sandbox will be created for the realm passed by id.
     *
     * @param {String} realm the realm to create the sandbox in
     * @param {String} alias the alias to use for the created sandbox
     * @param {Number} ttl number of hours, the sandbox will live (if absent the realm default ttl is used)
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} sync whether to operate in synchronous mode, false by default
     * * @param {Boolean} setAsDefault optional flag to set as new default instance, false by default
     */
    create : function(realm, alias, ttl, asJson, sync, setAsDefault) {
        // memorize the start time and duration
        var startTime = Date.now();
        var duration = 0;

        createSandbox(realm, ttl, function(err, newSandbox) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
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
            // use <realm>-<instance> as standard alias
            var newAlias = newSandbox.realm + '-' + newSandbox.instance;
            // ...or use passed alias
            if ( alias ) {
                newAlias = alias;
            }
            instance.addInstance(newHost, newAlias);

            // append to result
            result['instance'] = { host: newHost, alias: newAlias, default: false };
            result['message'] += util.format(' New sandbox host %s added to list of instances using alias "%s".',
                newHost, newAlias);

            // set new sandbox as default instance using alias, if passed
            if ( setAsDefault ) {
                instance.config.setDefault(newHost, function(err) {
                    if (!err) {
                        result['instance']['default'] = true;
                        result['message'] += ' New sandbox set as default instance.';
                    } else {
                        result['warning'] = err.message;
                    }
                });
            } else if ( instance.getAllInstances().length === 1 && !instance.config.getDefault() ) {
                // set as default, if its the first instance and no default set yet
                instance.config.setDefault(newHost, function(err) {
                    if (!err) {
                        result['instance']['default'] = true;
                        result['message'] += ' New sandbox set as default instance.';
                    } else {
                        result['warning'] = err.message;
                    }
                });
            }

            // in async mode, just return the result of the triggering
            if (!sync) {
                if (asJson) {
                    console.json(result);
                } else {
                    console.info(result['message']);
                    if (result['warning']) {
                        console.warn(result['warning']);
                    }
                }
                return;
            }

            // in sync mode, read the details of the sandbox we have just triggered creation for

            // no failure
            var finished = false;
            var fault = null;

            // error threshold
            var errorThreshold = SANDBOX_STATUS_POLL_ERROR_THRESHOLD;

            // monitor creation and status updates until either status of new sandbox is started or operation
            // timeout has been reached
            var timeout = setInterval(function() {
                // poll the status
                getSandbox(newSandbox.id, function(err, sandbox) {
                    // check if operation timeout has been exceeded
                    if ( Date.now() - startTime > API_SANDBOXES_OPERATION_TIMEOUT ) {
                        // report an exceeded operation timeout
                        fault = {
                            message : 'Sandbox creation timeout has been exceeded.'
                        };
                    } else if (err && errorThreshold > 0) {
                        // in case status retrieval failed
                        // decrease the error threshold
                        errorThreshold--;
                        // don't set an error and allow the polling to continue
                        console.debug('Polling sandbox status failed. Polling error threshold not reached.');
                    } else if (err && errorThreshold === 0) {
                        // report a reached error threshold during polling
                        fault = {
                            message : 'Polling sandbox status failed. Error threshold reached. Stop polling, ' +
                                'the creation may still continue. Detailed error was ' + err.message
                        };
                    } else if (!err) {
                        // status retrieved
                        // update the status
                        //newSandbox = sandbox;
                        result['sandbox'] = sandbox;
                        if (sandbox && sandbox.state === SANDBOX_STATUS_UP_AND_RUNNING ) {
                            finished = true;
                        } else if (sandbox && sandbox.state === SANDBOX_STATUS_FAILED ) {
                            // report a failed sandbox
                            fault = {
                                message : 'Sandbox creation resulted in sandbox of status `failed`'
                            };
                        }
                    }

                    if (!finished && !fault) {
                        // continue polling
                        return;
                    }

                    // update duration
                    duration = Date.now() - startTime;
                    // skip polling
                    clearInterval(timeout);

                    if (fault) {
                        // the sandbox creation was triggered, but the polling failed or sandbox state is failed
                        // treat this as error
                        result['error'] = fault.message;
                    } else {
                        // TODO append message (e.g. from default set)
                        result['message'] = util.format('Creation of new sandbox %s for realm %s finished (%s ms). ' +
                            'Sandbox id is %s, status of sandbox is %s. You may use `sfcc-ci sandbox:list` to ' +
                            'check the status of the creation.', result['sandbox'].instance, result['sandbox'].realm,
                        duration, result['sandbox'].id, result['sandbox'].state);
                    }

                    // format output as JSON if needed
                    if ( asJson ) {
                        console.json(result);
                        return;
                    }

                    // plain output
                    console.info(result['message']);
                    if (result['warning']) {
                        console.warn(result['warning']);
                    }
                    if (result['error']) {
                        console.error(result['error']);
                    }
                });
            }, SANDBOX_STATUS_POLL_TIMEOUT);
        });
    },

    /**
     * Retrieves details of a single sandbox and renders them in the console. The sandbox to determine is provided
     * by the passed sandbox spec. The sandbox spec is an object holding properties to identify the sandbox, such
     * as the id, or the realm and the instance.
     *
     * @param {Object} spec specification of the sandbox to get details for
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} hostOnly optional flag to return the well-defined host name of the sandbox, false by default
     * @param {Boolean} openBrowser optional flag to open a browser to the Business Manager, false by default
     */
    get : function(spec, asJson, hostOnly, openBrowser) {
        // sandbox to determine
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox
        lookupSandbox(spec, function(err, foundSandbox) {
            var result = {};
            if (err) {
                result['error'] = err.message;
            }

            // if no error, but sandbox not found
            if ( !result['error'] && !foundSandbox ) {
                var id = spec['id'];
                if (spec['realm'] && spec['instance']) {
                    id = spec['realm'] + '-' + spec['instance'];
                }
                result['error'] = util.format('Sandbox %s does not exist', id);
            }

            if ( result['error'] ) {
                if (asJson) {
                    console.json(result);
                } else {
                    console.error(result['error']);
                }
                return;
            }

            // extend with instance details
            result['instance'] = instance.getInstanceDetails(getSandboxHost(foundSandbox));

            if (hostOnly) {
                if (asJson) {
                    console.json({'host' : result['instance']['host']});
                } else {
                    console.info(result['instance']['host']);
                }
                return;
            }

            if (openBrowser) {
                // open BM URL in browser
                var bmUrl = 'https://' + getSandboxHost(foundSandbox) +
                    BM_PATH;
                console.info('Opening browser to Business Manager...');
                open(bmUrl);
                return;
            }

            // add the sandbox
            result['sandbox'] = foundSandbox;

            if (asJson) {
                console.json(result);
            } else {
                console.prettyPrint(result);
            }
        });
    },

    /**
     * Triggers the removal of an existing sandbox. The sandbox to remove is provided by the passed sandbox spec.
     * The sandbox spec is an object holding properties to identify the sandbox, such as the id, or the realm and
     * the instance.
     *
     * @param {Object} spec specification of the sandbox to issue for removal
     */
    remove : function(spec) {
        // sandbox to remove
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox to remove
        lookupSandbox(spec, function(err, foundSandbox) {
            if (err) {
                // error
                console.error(err.message);
                return;
            } else if ( !foundSandbox ) {
                // no sandbox found
                if (spec['realm'] && spec['instance']) {
                    console.error('Cannot find sandbox with realm %s and instance %s.', spec['realm'],
                        spec['instance']);
                } else {
                    console.error('Cannot find sandbox with id %s.', spec['id']);
                }
                return;
            } else {
                // sandbox found, remove it
                removeSandbox(foundSandbox.id, function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    // remove from instance config
                    instance.config.removeInstance(getSandboxHost(foundSandbox));

                    console.info('Removal of sandbox %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                        'status of the removal.', foundSandbox.id);
                });
            }
        });
    },

    /**
     * Starts a sandbox.
     *
     * @param {String} spec specification of the sandbox to start
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} sync whether to operate in synchronous mode, false by default
     */
    start : function(spec, asJson, sync) {
        // sandbox to restart
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox to remove
        lookupSandbox(spec, function(err, foundSandbox) {
            if (err) {
                // error
                console.error(err.message);
                return;
            } else if ( !foundSandbox ) {
                // no sandbox found
                if (spec['realm'] && spec['instance']) {
                    console.error('Cannot find sandbox with realm %s and instance %s.', spec['realm'],
                        spec['instance']);
                } else {
                    console.error('Cannot find sandbox with id %s.', spec['id']);
                }
                return;
            } else {
                // sandbox found, trigger operation
                triggerOperation(foundSandbox.id, 'start', function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }

                    console.info('Starting %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                        'status of the operation.', foundSandbox.id);
                });
            }
        });
    },

    /**
     * Stops a sandbox.
     *
     * @param {String} spec specification of the sandbox to stop
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} sync whether to operate in synchronous mode, false by default
     */
    stop : function(spec, asJson, sync) {
        // sandbox to restart
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox to remove
        lookupSandbox(spec, function(err, foundSandbox) {
            if (err) {
                // error
                console.error(err.message);
                return;
            } else if ( !foundSandbox ) {
                // no sandbox found
                if (spec['realm'] && spec['instance']) {
                    console.error('Cannot find sandbox with realm %s and instance %s.', spec['realm'],
                        spec['instance']);
                } else {
                    console.error('Cannot find sandbox with id %s.', spec['id']);
                }
                return;
            } else {
                // sandbox found, trigger operation
                triggerOperation(foundSandbox.id, 'stop', function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }

                    console.info('Stopping %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                        'status of the operation.', foundSandbox.id);
                });
            }
        });
    },

    /**
     * Restarts a sandbox.
     *
     * @param {String} spec specification of the sandbox to restart
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} sync whether to operate in synchronous mode, false by default
     */
    restart : function(spec, asJson, sync) {
        // sandbox to restart
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox to remove
        lookupSandbox(spec, function(err, foundSandbox) {
            if (err) {
                // error
                console.error(err.message);
                return;
            } else if ( !foundSandbox ) {
                // no sandbox found
                if (spec['realm'] && spec['instance']) {
                    console.error('Cannot find sandbox with realm %s and instance %s.', spec['realm'],
                        spec['instance']);
                } else {
                    console.error('Cannot find sandbox with id %s.', spec['id']);
                }
                return;
            } else {
                // sandbox found, trigger operation
                triggerOperation(foundSandbox.id, 'restart', function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }

                    console.info('Restart of %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                        'status of the operation.', foundSandbox.id);
                });
            }
        });
    },

    /**
     * Reset a sandbox.
     *
     * @param {String} spec specification of the sandbox to reset
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} sync whether to operate in synchronous mode, false by default
     */
    reset : function(spec, asJson, sync) {
        // sandbox to restart
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox to remove
        lookupSandbox(spec, function(err, foundSandbox) {
            if (err) {
                // error
                console.error(err.message);
                return;
            } else if ( !foundSandbox ) {
                // no sandbox found
                if (spec['realm'] && spec['instance']) {
                    console.error('Cannot find sandbox with realm %s and instance %s.', spec['realm'],
                        spec['instance']);
                } else {
                    console.error('Cannot find sandbox with id %s.', spec['id']);
                }
                return;
            } else {
                // sandbox found, trigger operation
                triggerOperation(foundSandbox.id, 'reset', function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }

                    console.info('Reset of %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                        'status of the operation.', foundSandbox.id);
                });
            }
        });
    },

    /**
     * Update a sandbox.
     *
     * @param {String} spec specification of the sandbox to update
     * @param {Number} ttl number of hours, the sandbox TTL will be prolonged
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    update : function(spec, ttl, asJson) {
        // sandbox to update
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox to update
        lookupSandbox(spec, function(err, foundSandbox) {
            if (err) {
                // error
                console.error(err.message);
                return;
            } else if ( !foundSandbox ) {
                // no sandbox found
                if (spec['realm'] && spec['instance']) {
                    console.error('Cannot find sandbox with realm %s and instance %s.', spec['realm'],
                        spec['instance']);
                } else {
                    console.error('Cannot find sandbox with id %s.', spec['id']);
                }
                return;
            } else {
                // sandbox found, trigger operation
                updateSandbox(foundSandbox.id, ttl, function(err, updatedSandbox) {
                    var result = {};
                    if (err) {
                        result['error'] = err.message;
                    } else {
                        result = updatedSandbox;
                    }
                    if (asJson) {
                        console.json(result);
                    } else if (err) {
                        console.error(err.message);
                    } else {
                        console.prettyPrint(result);
                    }
                });
            }
        });
    }
}
