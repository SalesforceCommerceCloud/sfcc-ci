/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var request = require('request');
var util = require('util');

var {table} = require('table');
var open = require('open');

var auth = require('./auth');
var instance = require('./instance');
var console = require('./log');
var dwjson = require('./dwjson').init();
var ocapi = require('./ocapi');
var readline = require('readline');

const API_HOST_DEFAULT = 'admin.dx.commercecloud.salesforce.com';
const API_HOST = getAPIHost();
const API_BASE = API_HOST + '/api/v1';
const API_SANDBOXES = API_BASE + '/sandboxes';
const API_SYSTEM = API_BASE + '/system';
const SANDBOX_API_POLLING_TIMEOUT = 1000 * 60 * 15; // 15 minutes
// ocapi settings to apply to sandbox at provisioning time, CLIENTID to be set beforehand
const SANDBOX_OCAPI_SETTINGS = [{ client_id: "CLIENTID",
    resources: [
        { resource_id: "/code_versions", methods: ["get"], read_attributes: "(**)", write_attributes: "(**)" },
        { resource_id: "/code_versions/*", methods: ["patch","delete"],
            read_attributes: "(**)", write_attributes: "(**)" },
        { resource_id: "/jobs/*/executions", methods: ["post"], read_attributes: "(**)", write_attributes: "(**)" },
        { resource_id: "/jobs/*/executions/*", methods: ["get"], read_attributes: "(**)", write_attributes: "(**)" },
        { resource_id: "/sites/*/cartridges", methods: ["post"], read_attributes: "(**)", write_attributes: "(**)" }
    ]
}];
// webdav permissions to apply to sandbox at provisioning time, CLIENTID to be set beforehand
const SANDBOX_WEBDAV_PERMISSIONS = [{ client_id: "CLIENTID",
    permissions: [
        { path: "/impex", operations: ["read_write"] },
        { path: "/cartridges", operations: ["read_write"] },
        { path: "/static", operations: ["read_write"] }
    ]
}];

const SANDBOX_STATUS_POLL_TIMEOUT = 5000;
const SANDBOX_STATUS_POLL_ERROR_THRESHOLD = 3;
const SANDBOX_STATUS_UP_AND_RUNNING = 'started';
const SANDBOX_STATUS_DOWN = 'stopped';
const SANDBOX_STATUS_FAILED = 'failed';
const BM_PATH = '/on/demandware.store/Sites-Site';
const SANDBOX_RESOURCE_PROFILES = [ 'medium', 'large', 'xlarge' ];

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
 * Utility function to wait for target sandbox to have a specific status. SetInterval calls
 * internal getSandox() at the rate defined in SANDBOX_STATUS_POLL_TIMEOUT until the target
 * status is found, or an error occurs.
 *
 * @param {Object} targetSandbox - sandbox to target status checks against
 * @param {String} targetStatus - sandbox status to check for, e.g. started, stopped
 */
function waitForSandboxStatus(targetSandbox, targetStatus) {

    var errorThreshold = SANDBOX_STATUS_POLL_ERROR_THRESHOLD;
    var startTime = Date.now();
    var finished = false;
    var fault = null;

    function pollSandbox() {

        // check for auth token before anything
        // ocapi.retryableCall will exit without a callback causing an infinite loop if auth expires
        if (!auth.getToken()) {
            clearInterval(timeout);
            console.error('Authorization no longer valid. Please (re-)authenticate first by running ' +
                '`sfcc-ci auth:login` or `sfcc-ci client:auth`');
            return;
        }

        // in case we come back around
        if (finished) {
            clearInterval(timeout);
            return;
        }

        // check if operation timeout has been exceeded
        if ((Date.now() - startTime) > getSandboxAPIPollingTimeout()) {
            // report an exceeded operation timeout
            clearInterval(timeout);
            console.error('Sandbox polling timeout has been exceeded.');
            return;
        }

        getSandbox(targetSandbox.id, null, function(err, sandbox) {
            // check if operation timeout has been exceeded
            if (err && errorThreshold > 0) {
                // in case status retrieval failed
                // decrease the error threshold
                errorThreshold--;
                // don't set an error and allow the polling to continue
                console.debug('Polling sandbox status failed. Polling error threshold not reached. Continuing.');
            } else if (err && errorThreshold === 0) {
                // report a reached error threshold during polling
                fault = {
                    message : 'Polling sandbox status failed. Error threshold reached. Stop polling, ' +
                        'the instantiating command may still be running. Detailed error was ' + err.message
                };
            } else if (!err) {
                // update the status
                if (sandbox && sandbox.state === targetStatus) {
                    finished = true;
                } else if (sandbox && sandbox.state === SANDBOX_STATUS_FAILED) {
                    // if sandbox status is failed, we should exit
                    finished = true;
                    // report a failed sandbox
                    fault = {
                        message : 'Sandbox has a `failed` status. Please investigate.'
                    };
                }
            }

            if (!finished && !fault) {
                // continue polling
                return;
            }

            // update duration
            var duration = Date.now() - startTime;

            // clear polling
            clearInterval(timeout);

            // resturn result
            if (fault) {
                // polling expired or sandbox state is failed
                // treat this as error
                console.error(fault.message);
            } else {
                console.info(util.format('Sandbox %s-%s with ID %s, was found with status `%s` (%s ms).',
                    sandbox.realm, sandbox.instance, sandbox.id, sandbox.state,duration));
                console.info('You may use `sfcc-ci sandbox:list` to check the status of all sandboxes.');
            }
        });
    }
    // setup recurring
    var timeout = setInterval(pollSandbox, SANDBOX_STATUS_POLL_TIMEOUT);
    // trigger immediately
    pollSandbox();
}

/**
 * Utility function to lookup the sandbox API polling timeout. By default it is defined as
 * SANDBOX_API_POLLING_TIMEOUT. The timeout can be overwritten using the environment
 * variable SFCC_SANDBOX_API_POLLING_TIMEOUT.
 *
 * @return {Number} the polling timeout in milliseconds
 */
function getSandboxAPIPollingTimeout() {
    // check on env var and return it if set
    if ( process.env.SFCC_SANDBOX_API_POLLING_TIMEOUT ) {
        // convert to milliseconds
        return ( 1000 * 60 * process.env.SFCC_SANDBOX_API_POLLING_TIMEOUT );
    }
    // return the default polling timeout
    return SANDBOX_API_POLLING_TIMEOUT;
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
    } else if (response.statusCode >= 400 && response['body'] && response['body']['error'] ) {
        error = new Error(response['body']['error']['message']);
    }
    // just return the error, in case no callback is passed
    if (!callback) {
        return error;
    }
    callback(error, response);
}

/**
 * Prints the given query on the console and waits for user input (<Enter key>).
 *
 * @param query query to print on console
 */
function askQuestion(query) {
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

/**
 * Prints the inbound IP addresses of the cluster on the console.
 */
function printInboundIPs(realm, json, cli) {
    var endpoint = API_SYSTEM;
    if (realm !== null) {
        endpoint = API_BASE + `/realms/${realm}/system`;
    }
    var options = ocapi.getOptions('GET', endpoint);

    ocapi.retryableCall('GET', options, function (err, res) {
        if (err) {
            console.error(err)
        } else if (res.statusCode >= 400) {
            console.error(res.body)
        } else {
            if (json) {
                if (cli) {
                    console.json({'inbound': res.body.data.inboundIps});
                } else {
                    console.json(res.body.data.inboundIps);
                }
                return;
            }
            console.log('');
            console.log('Inbound IP addresses' + ( realm !== null ? ` (for realm ${realm})` : '' ) + ':');

            // table fields
            var data = [['address']];
            for (var i in res.body.data.inboundIps) {
                data.push([res.body.data.inboundIps[i]]);
            }
            console.table(data);
        }
    });
}

/**
 * Prints the outbound IP addresses of the cluster on the console.
 */
function printOutboundIPs(realm, json, cli) {
    var endpoint = API_SYSTEM;
    if (realm !== null) {
        endpoint = API_BASE + `/realms/${realm}/system`;
    }
    var options = ocapi.getOptions('GET', endpoint);

    ocapi.retryableCall('GET', options, function (err, res) {
        if (err) {
            console.error(err)
        } else if (res.statusCode >= 400) {
            console.error(res.body)
        } else {
            if (json) {
                if (cli) {
                    console.json({'outbound': res.body.data.outboundIps});
                } else {
                    console.json(res.body.data.outboundIps);
                }
                return;
            }
            console.log('');
            console.log('Outbound IP addresses' + ( realm !== null ? ` (for realm ${realm})` : '' ) + ':');

            // table fields
            var data = [['address']];
            for (var i in res.body.data.outboundIps) {
                data.push([res.body.data.outboundIps[i]]);
            }
            console.table(data);
        }
    });
}

/**
 * Attempts the merge API settings. Checks the passed settingsAsJSON string for validity.
 * Checks if the JSON string is syntactically correct and does a basic semantic check for
 * the same API client as used by the CLI client. Throws an error if a check failed.
 *
 * Note, we allow to pass API settings for the same API client as granted to in the base
 * settings, since we amend additional API resources, we don't replace them.
 *
 * @param {Object} baseSettings the base API settings as object
 * @param {String} resourceProp the property of the API permissions that holds the actual perm set
 * @param {String} settingsAsJSON the settings to merge into the base settings as JSON string
 * @return {Object} the merged API settings
 */
function mergeAPISettings(baseSettings, resourceProp, settingsAsJSON) {
    var settingsToMerge;
    // syntactical check
    try {
        settingsToMerge = JSON.parse(settingsAsJSON);
    } catch (err) {
        console.debug(`Invalid JSON: ${err.message}`);
        throw new Error(`Invalid JSON`);
    }

    var finalSettings = [];
    // sematical check
    if (settingsToMerge['client_id'] && settingsToMerge.client_id === auth.getClient()) {
        console.debug(`Patch existing permissions. Amending API resources.`);
        baseSettings[0][resourceProp] = baseSettings[0][resourceProp].concat(settingsToMerge[resourceProp]);
        finalSettings = baseSettings;
    } else if (Array.isArray(settingsToMerge)) {
        // in case of a multiple clients
        settingsToMerge.forEach(function(client) {
            if (client['client_id'] && client.client_id === auth.getClient()) {
                console.debug(`Patch existing permissions. Amending API resources.`);
                baseSettings[0][resourceProp] = baseSettings[0][resourceProp].concat(client[resourceProp]);
            } else {
                // simply concat
                finalSettings = finalSettings.concat(client);
            }
        });
        finalSettings = baseSettings.concat(finalSettings);
    } else {
        // simply concat
        finalSettings = finalSettings.concat(settingsToMerge);
    }

    console.debug(`Merged API settings: ${JSON.stringify(finalSettings)}`);
    return finalSettings;
}

/**
 * Retrieves all realms and returns them as array.
 *
 * @param {Function} callback the callback to execute, the error and the list of realms are available as arguments to the callback function
 */
function getRealms(callback) {
    ocapi.retryableCall('GET', API_BASE + '/me', function(err, res) {
        if ( err ) {
            callback(new Error(util.format('Getting realms failed: %s', err)), []);
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting realms failed: %s', res.statusCode)));
        } else {
            callback(undefined, res.body['data']['realms']);
        }
    });
}

/**
 * Retrieves details of a realm.
 *
 * @param {String} realmID the id of the realm
 * @param {String} topic the topic to retrieve details about
 * @param {Function} callback the callback to execute, the error and the realm are available as arguments to the callback function
 */
function getRealm(realmID, topic, callback) {
    // build the request options
    // use some default expansions
    var extension = '?expand=configuration,usage';
    // optionally retrieve details from different endpoints
    if ( topic !== null ) {
        extension = '/' + topic
        // for retrieving usage data, always retrieve full usage
        if ( topic === 'usage' ) {
            extension += '?from=2019-01-01';
        }
    }
    ocapi.retryableCall('GET', API_BASE + '/realms/' + realmID + extension, function(err, res) {
        if ( err ) {
            callback(new Error(util.format('Getting realm failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting realm failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, res.body['data']);
    });
}

/**
 * Update realm settings
 *
 * @param {String} realmID the realm (id) to update
 * @param {Number} maxSandboxTTL the new maximum sandbox ttl
 * @param {Number} defaultSandboxTTL the new default sandbox ttl
 * @param {Function} callback the callback to execute, the error and the realm details are available as arguments to the callback function
 */
function updateRealm(realmID, maxSandboxTTL, defaultSandboxTTL, callback) {
    // build the request options
    var options = ocapi.getOptions('PATCH', API_BASE + '/realms/' + realmID + '/configuration');

    // the payload
    options['body'] = { sandbox : { sandboxTTL : {} } };

    if (maxSandboxTTL) {
        options['body']['sandbox']['sandboxTTL']['maximum'] = maxSandboxTTL.toFixed();
    }
    if (defaultSandboxTTL) {
        options['body']['sandbox']['sandboxTTL']['defaultValue'] = defaultSandboxTTL.toFixed();
    }

    // TODO set schedule here
    //if (schedule) {
    //    options['body']['sandbox']['stopScheduler'] = schedule['stopScheduler'] ? schedule['stopScheduler'] : null;
    //    options['body']['sandbox']['startScheduler'] = schedule['startScheduler'] ? schedule['startScheduler'] : null;
    //}

    ocapi.retryableCall('PATCH', options, function(err, res) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Updating realm settings failed: %s', body.message));
            } else if (err) {
                errback = new Error(util.format('Updating realm settings failed: %s', err));
            }
        }
        callback(errback, res.body['data']);
    });
}

/**
 * Retrieves all known sandboxes and returns them as array.
 *
 * @param {Boolean} includeDeleted whether or not to include deleted sandboxes, false by default
 * @param {Function} callback the callback to execute, the error and the list of sandboxes are available as arguments to the callback function
 */
function getAllSandboxes(includeDeleted, callback) {
    ocapi.retryableCall('GET', API_SANDBOXES + ( includeDeleted ? '?include_deleted=true' : '' ), function(err, res) {
        var list = [];
        if ( err ) {
            callback(new Error(util.format('Retrieving list of sandboxes failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Retrieving list of sandboxes failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, res.body.data);
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
    getAllSandboxes(false, function(err, list) {
        if (err) {
            callback(err);
            return;
        }
        if ( typeof(list) === 'undefined' || list.length === 0 ) {
            callback(new Error('Cannot lookup sandbox.'), null);
            return;
        }
        var filtered = list.filter(function(cand) {
            // check on filter criterias
            return ( cand.id === spec['id'] || cand.realm === spec['realm'] && cand.instance === spec['instance'] ||
                cand.hostName === host );
        });

        if ( filtered.length === 0 ) {
            callback(new Error('Cannot find sandbox with given ID.'), null);
            return;
        } else if ( filtered.length === 1 ) {
            callback(undefined, filtered[0]);
            return;
        }

        callback(new Error('Found ' + filtered.length + ' matching sandboxes.'));
    });
}

/**
 * Creates a sandbox for given realm. Realm ID can be passed as parameter or provided dw.json file located in the current working directory.
 *
 * @param {String} realm the realm to create the sandbox for
 * @param {String} ttl the ttl of the sandbox in hours
 * @param {String} profile the resource profile of the sandbox
 * @param {Boolean} autoScheduled sets the sandbox as auto scheduled
 * @param {String} additionalOcapiSettings JSON string holding additonal OCAPI settings to pass
 * @param {String} additionalWebdavSettings JSON string holding additonal WebDAV permissions to pass
 * @param {Function} callback the callback to execute, the error and the created sandbox are available as arguments to the callback function
 */
function createSandbox(realm, ttl, profile, autoScheduled, additionalOcapiSettings, additionalWebdavSettings,
    callback) {
    if (!realm && dwjson['realm']) {
        realm = dwjson['realm'];
        console.debug('Using realm id %s from dw.json at %s', dwjson['realm'], process.cwd());
    }

    // build the request options
    var options = ocapi.getOptions('POST', API_SANDBOXES);

    // prep initial ocapi settings
    var ocapiSettings = SANDBOX_OCAPI_SETTINGS;
    ocapiSettings[0]['client_id'] = auth.getClient();

    // amend with additional settings
    if (additionalOcapiSettings) {
        try {
            ocapiSettings = mergeAPISettings(ocapiSettings, 'resources', additionalOcapiSettings);
        } catch (err) {
            callback(new Error(`Invalid OCAPI settings: ${err.message}`));
            return;
        }
    }

    // prep initial webdav permissions
    var webdavPermissions = SANDBOX_WEBDAV_PERMISSIONS;
    webdavPermissions[0]['client_id'] = auth.getClient();

    // amend with additional settingss
    if (additionalWebdavSettings) {
        try {
            webdavPermissions = mergeAPISettings(webdavPermissions, 'permissions', additionalWebdavSettings);
        } catch (err) {
            callback(new Error(`Invalid WebDAV settings: ${err.message}`));
            return;
        }
    }

    // the payload
    options['body'] = {
        realm : realm,
        settings : {
            ocapi : ocapiSettings,
            webdav : webdavPermissions
        }
    };

    // the ttl, if passed
    if (ttl !== null && !isNaN(ttl)) {
        options['body']['ttl'] = ttl.toFixed();
    }

    // set auto scheduled, if passed
    if (autoScheduled) {
        options['body']['autoScheduled'] = true;
    }

    // the profile, if passed
    if (profile !== null) {
        if (SANDBOX_RESOURCE_PROFILES.indexOf(profile) === -1) {
            callback(new Error(`Invalid resource profile '${profile}', use one of:
                ${SANDBOX_RESOURCE_PROFILES.join(', ')}`));
            return;
        }
        options['body']['resourceProfile'] = profile;
    }

    ocapi.retryableCall('POST', options, function(err, res) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Creating sandbox for realm %s failed: %s', realm,
                    formatError(res.body.error, res.statusCode)));
            } else if (err) {
                errback = new Error(util.format('Creating sandbox for realm %s failed: %s', realm, err));
            }
        }
        callback(errback, res.body['data']);
    });
}

/**
 * Retrieves details of a single sandboxes by id.
 *
 * @param {String} id the sandbox to get details for
 * @param {String} topic the topic to retrieve details about
 * @param {Function} callback the callback to execute, the error and the sandbox details are available as arguments to the callback function
 */
function getSandbox(id, topic, callback) {
    // build the request options
    var extension = '';
    if ( topic !== null ) {
        extension = '/' + topic
    }

    // do the request
    ocapi.retryableCall('GET', API_SANDBOXES + '/' + id + extension, function(err, res) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s',
                    formatError(res.body.error, res.statusCode)));
            } else if (err) {
                errback = new Error(util.format('Retrieving details for sandbox failed: %s', err));
            }
        }
        callback(errback, res.body['data']);
    });
}

/**
 * Update sandbox details
 *
 * @param {String} id the sandbox update
 * @param {Number} ttl the ttl to update (value will not overwrite the existing ttl, but added to the ttl = prolonged)
 * @param {Boolean} autoScheduled sets the sandbox as auto scheduled
 * @param {Function} callback the callback to execute, the error and the sandbox details are available as arguments to the callback function
 */
function updateSandbox(id, ttl, autoScheduled, callback) {
    // build the request options
    var options = ocapi.getOptions('PATCH', API_SANDBOXES + '/' + id);
    options['body'] = {};

    // the ttl, if passed
    if (ttl !== null && !isNaN(ttl)) {
        options['body']['ttl'] = ttl.toFixed();
    }

    // sets auto scheduled
    if ( autoScheduled !== null ) {
        options['body']['autoScheduled'] = autoScheduled;
    }

    ocapi.retryableCall('PATCH', options, function(err, res) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Updating sandbox failed: %s',
                    formatError(res.body.error, res.statusCode)));
            } else if (err) {
                errback = new Error(util.format('Updating sandbox failed: %s', err));
            }
        }
        callback(errback, res.body['data']);
    });
}

/**
 * Delete a sandbox by id
 *
 * @param {String} id the id of the sandbox to delete
 * @param {Function} callback the callback to execute, the error and the result details are available as arguments to the callback function
 */
function deleteSandbox(id, callback) {
    ocapi.retryableCall('DELETE', API_SANDBOXES + '/' + id, function(err, res) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Removing sandbox failed: %s',
                    formatError(res.body.error, res.statusCode)));
            } else if (err) {
                errback = new Error(util.format('Removing sandbox failed: %s', err));
            }
        }
        callback(errback, res.body);
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
    var options = ocapi.getOptions('POST', API_SANDBOXES + '/' + id + '/operations');

    // the payload
    options['body'] = {
        operation : operation
    };

    ocapi.retryableCall('POST', options, function(err, res) {
        var errback = captureCommonErrors(err, res);
        if ( !errback ) {
            if (res.statusCode >= 400) {
                errback = new Error(util.format('Operation failed: %s', formatError(res.body.error, res.statusCode)));
            } else if (err) {
                errback = new Error(util.format('Operation failed: %s', err));
            }
        }
        callback(errback, res.body);
    });
}

/**
 * Calls the given alias registration link in the browser after printing the inbound cluster IPs.
 *
 * @param {String} realm realm to lookup ips for
 * @param {String} link registration link
 * @param {String} host host name
 */
function doCookieRegistration(realm, link, host) {
    if (!link) {
        console.warn("No registration link provided.");
        return
    }
    printInboundIPs(realm);
    (async() => {
        await askQuestion('Please point the domain (' + host + ') in your etc/hosts to one of the inbound IP ' +
            'addresses and set the alias in your instance\'s site alias configuration (in Business Manager at: ' +
            'Merchant Tools > SEO > Aliases). Press <Enter> when ready:');
        open(link)
    })();
}

/**
 * Register a hostname alias for a sandbox.
 *
 * @param sbxID ID of the sandbox to create alias for
 * @param alias name of the alias to create
 * @param unique true, if the alias is unique across aliases, false by default
 * @param {Function} callback the callback to execute, the error and the created alias are available as arguments to the callback function
 */
function registerForSandbox(sbxID, alias, unique, callback) {
    // the payload
    var options = ocapi.getOptions('POST', API_SANDBOXES + '/' + sbxID + '/aliases');
    options['body'] = {name: alias, unique: !!unique};

    ocapi.retryableCall('POST', options, function (err, res) {
        if (err) {
            callback(new Error(util.format('Creating sandbox alias failed: %s', err)));
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Creating sandbox alias failed: %s', res.body.error.message)));
        } else {
            callback(undefined, res.body.data);
        }
    });
}

/**
 * Read a hostname alias for a sandbox.
 *
 * @param sbxID ID of the sandbox to read alias for
 * @param aliasID ID of the alias to read
 * @param {Function} callback the callback to execute, the error and the created alias are available as arguments to the callback function
 */
function readAliasConfig(sbxID, aliasID, callback) {
    ocapi.retryableCall('GET', API_SANDBOXES + '/' + sbxID + '/aliases/' + aliasID, function (err, res) {
        if (err) {
            callback(new Error(util.format('Reading sandbox alias failed: %s', err)), []);
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Reading sandbox alias failed: %s', res.body.error.message)));
        } else {
            callback(undefined, res.body.data);
        }
    });
}

/**
 * List hostname aliases for a sandbox.
 *
 * @param sbxID ID of the realm to list aliases for
 * @param {Function} callback the callback to execute, the error and the list of aliases are available as arguments to the callback function
 */
function listForSandbox(sbxID, callback) {
    ocapi.retryableCall('GET', API_SANDBOXES + '/' + sbxID + '/aliases', function (err, res) {
        if (err) {
            callback(new Error(util.format('Getting sandbox aliases failed: %s', err)), []);
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Getting sandbox aliases failed: %s', res.body.error.message)));
        } else {
            callback(undefined, res.body.data);
        }
    });
}

/**
 * Delete a hostname alias for a sandbox. Successful if the alias is not existent after this method call (will ignore
 * already non-existing alias).
 *
 * @param sbxID ID of the realm to delete alias for
 * @param aliasID ID of the CNAME alias to delete
 * @param {Function} callback the callback to execute, the error is available as argument to the callback function
 */
function unregisterForSandbox(sbxID, aliasID, callback) {
    ocapi.retryableCall('DELETE', API_SANDBOXES + '/' + sbxID + '/aliases/' + aliasID, function (err, res) {
        if (res.statusCode === 404) {
            callback(undefined);
        } else if (err) {
            callback(new Error(util.format('Deleting sandbox alias failed: %s', err)));
        } else if (res.statusCode >= 400) {
            if (res.body && res.body.error) {
                callback(new Error(util.format('Deleting sandbox alias failed: %s', res.body.error.message)));
            } else {
                callback(new Error('Invalid alias id'));
            }
        } else {
            callback(undefined);
        }
    });
}

/**
 * Runs a callback function for a sandbox, which is defined by a specification object. This specification has to
 * either contain the sandbox UUID as field 'id' or it's 'realm' and 'instance'. The callback function then gets
 * the sandbox as a parameter.
 * NOTE that the callback function is NOT called, if there was no sandbox found.
 *
 * @param spec      specification object with sandbox ID or tenant information
 * @param asJson    true, for json logging enabled
 * @param callback  callback function which gets the sandbox as parameter
 */
function runForSandbox(spec, asJson, callback) {
    if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
        console.error('Provide either an id or a realm and an instance of the sandbox.');
        return;
    }
    lookupSandbox(spec, function(err, foundSandbox) {
        if (err) {
            if (asJson) {
                console.json({error: err.message});
            } else {
                console.error(err.message);
            }
            return;
        }
        callback(foundSandbox);
    });
}


function formatError(error, statusCode) {
    return error ? error.message : "unknown error (code " + statusCode + ")";
}

module.exports.cli = {
    realm : {
        /**
         * Lists realms eligible to manage sandboxes for.
         *
         * @param {String} realm the realm id or null if all realms should be returned (optional)
         * @param {String} topic topic to retrieve details for (optional)
         * @param {Boolean} asJson optional flag to force output in json, false by default
         * @param {String} sortBy optional field to sort the list by
         */
        list : function(realm, topic, asJson, sortBy) {
            // get details of a single realm if realm id was passed
            if ( typeof(realm) !== 'undefined' && realm !== null ) {
                getRealm(realm, topic, function (err, realm) {
                    if (err) {
                        if (asJson) {
                            console.json({error: err.message});
                        } else {
                            console.error(err.message);
                        }
                        return;
                    }

                    if (asJson) {
                        console.json(realm);
                        return;
                    }
                    console.prettyPrint(realm);
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
                var data = [['id']];
                for (var i of list) {
                    data.push([i]);
                }

                console.table(data);
            });
        },

        /**
         * Update realm settings
         *
         * @param {String} realm realm to update
         * @param {Number} maxSandboxTTL max number of hours a sandbox can live in the realm
         * @param {Number} defaultSandboxTTL number of hours a sandbox lives in the realm by default
         */
        update : function(realm, maxSandboxTTL, defaultSandboxTTL, asJson) {
            // lookup realm to update
            getRealm(realm, null, function (err, realm) {
                if (err) {
                    // error
                    console.error(err.message);
                    return;
                }

                // realm found, now update
                updateRealm(realm.id, maxSandboxTTL, defaultSandboxTTL, function(err, updatedRealm) {
                    var result = {};
                    if (err) {
                        result['error'] = err.message;
                    } else {
                        result = updatedRealm;
                    }
                    if (asJson) {
                        console.json(result);
                    } else if (err) {
                        console.error(err.message);
                    } else {
                        console.prettyPrint(result);
                    }
                });
            });
        }
    },

    /**
     * List all sandboxes currently created and renders them in the console.
     *
     * @param {Boolean} showDeleted optional flag whether or not to show deleted sandboxes, false by default
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of sandboxes by
     */
    list : function(showDeleted, asJson, sortBy) {
        getAllSandboxes(showDeleted, function(err, list) {
            if (err) {
                console.error(err.message);
                return;
            }

            if (typeof(list) === 'undefined' || list.length === 0) {
                if (asJson) {
                    console.json([]);
                } else {
                    console.info('No sandboxes found');
                }
                return;
            }

            if (sortBy) {
                list = require('./json').sort(list, sortBy);
            }

            if (asJson) {
                console.json(list);
                return;
            }

            // table fields
            var data = [['id','realm','instance','version','state','createdAt','eol','createdBy','autoScheduled',
                'resourceProfile']];
            for (var i of list) {
                data.push([i.id,i.realm,i.instance,i.versions.app,i.state,i.createdAt,i.eol,i.createdBy,
                    i.autoScheduled,i.resourceProfile]);
            }

            console.table(data);
        });
    },

    ips : function (realm, asJson) {

        printInboundIPs(realm, asJson, true, function(err, ips) {
            if (err) {
                console.error(err.message);
                return;
            }
            if (asJson) {
                console.json(ips);
                return;
            }

            if (ips.length === 0) {
                console.info('No details found');
                return;
            }

            console.info(ips);
        });

        printOutboundIPs(realm, asJson, true, function(err, ips) {
            if (err) {
                console.error(err.message);
                return;
            }
            if (asJson) {
                console.json(ips);
                return;
            }

            if (ips.length === 0) {
                console.info('No details found');
                return;
            }

            console.info(ips);
        });
    },

    /**
     * Triggers the creation of a new sandbox. The sandbox will be created for the realm passed by id.
     *
     * @param {String} realm the realm to create the sandbox in
     * @param {String} alias the alias to use for the created sandbox
     * @param {Number} ttl number of hours, the sandbox will live (if absent the realm default ttl is used)
     * @param {String} profile resource profile used (if absent "medium" is used)
     * @param {Boolean} autoScheduled sets the sandbox as auto scheduled (false by default)
     * @param {String} ocapiSettings additional ocapi settings
     * @param {String} webdavPermissions additional webdav permissions
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {Boolean} sync whether to operate in synchronous mode, false by default
     * * @param {Boolean} setAsDefault optional flag to set as new default instance, false by default
     */
    create : function(realm, alias, ttl, profile, autoScheduled, ocapiSettings, webdavPermissions, asJson, sync,
        setAsDefault) {
        // memorize the start time and duration
        var startTime = Date.now();
        var duration = 0;

        createSandbox(realm, ttl, profile, autoScheduled, ocapiSettings, webdavPermissions, function(err, newSandbox) {
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
                    'check the status of the sandbox.', newSandbox.instance, newSandbox.realm, newSandbox.id,
                newSandbox.state),
                sandbox : newSandbox };

            // add to list of instances and use alias, if passed
            var newHost = newSandbox.hostName;
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
                getSandbox(newSandbox.id, null, function(err, sandbox) {
                    // check if operation timeout has been exceeded
                    if ( Date.now() - startTime > getSandboxAPIPollingTimeout() ) {
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
                            'check the status of the sandbox.', result['sandbox'].instance, result['sandbox'].realm,
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
     * @param {String} topic topic to retrieve details for
     */
    get : function(spec, asJson, hostOnly, openBrowser, topic) {
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
            result['instance'] = instance.getInstanceDetails(foundSandbox.hostName);

            if (hostOnly) {
                // return host name only
                var host = foundSandbox.hostName;
                if (asJson) {
                    console.json({'host' : host});
                } else {
                    console.info(host);
                }
                return;
            } else if (openBrowser) {
                // open BM URL in browser
                var bmUrl = 'https://' + foundSandbox.hostName +
                    BM_PATH;
                console.info('Opening browser to Business Manager...');
                open(bmUrl);
                return;
            } else if (topic) {
                // get topic details
                getSandbox(foundSandbox['id'], topic, function(error, sandbox) {
                    if (asJson) {
                        console.json(sandbox);
                    } else {
                        console.prettyPrint(sandbox);
                    }
                });
                return;
            }

            // get all details incl. links via additional API call
            getSandbox(foundSandbox['id'], null, function(error, sandbox) {
                // add the sandbox
                result['sandbox'] = sandbox;

                if (asJson) {
                    console.json(result);
                } else {
                    console.prettyPrint(result);
                }
            });
        });
    },

    /**
     * Triggers the deletion of an existing sandbox. The sandbox to dele is provided by the passed sandbox spec.
     * The sandbox spec is an object holding properties to identify the sandbox, such as the id, or the realm and
     * the instance.
     *
     * @param {Object} spec specification of the sandbox to issue for deletion
     */
    delete : function(spec) {
        // sandbox to delete
        var foundSandbox = null;

        // id not provided, using other properties to lookup sandbox
        if ( !( spec['id'] || ( spec['realm'] && spec['instance'] ) ) ) {
            console.error('Provide either an id or a realm and an instance of the sandbox.');
            return;
        }

        // try to find the sandbox to delete
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
                // sandbox found, delete it
                deleteSandbox(foundSandbox.id, function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    // remove from instance config
                    instance.config.removeInstance(foundSandbox.hostName);

                    console.info('Deletion of sandbox %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                        'status of the deletion.', foundSandbox.id);
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

        // try to find the sandbox to start
        lookupSandbox(spec, function(err, foundSandbox) {
            if (err) {
                // error
                console.error(err.message);
                return;
            }

            if (!foundSandbox) {
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

                    if (!sync) {
                        console.info('Starting %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                            'status of the operation.', foundSandbox.id);
                    } else {
                        console.info('Starting %s was triggered. Waiting for sandbox to finish starting...',
                            foundSandbox.id);
                        waitForSandboxStatus(foundSandbox, SANDBOX_STATUS_UP_AND_RUNNING);
                    }
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

                    if (!sync) {
                        console.info('Stopping %s triggered. You may use `sfcc-ci sandbox:list` to check the ' +
                            'status of the operation.', foundSandbox.id);
                    } else {
                        console.info('Stopping %s was triggered. Waiting for sandbox to finish stopping...',
                            foundSandbox.id);
                        waitForSandboxStatus(foundSandbox, SANDBOX_STATUS_DOWN);
                    }
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
     * @param {Boolean} autoScheduled sets the sandbox as auto scheduled
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    update : function(spec, ttl, autoScheduled, asJson) {
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
                updateSandbox(foundSandbox.id, ttl, autoScheduled, function(err, updatedSandbox) {
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
    },

    alias : {
        /**
         * Registers an alias for a sandbox and forces a registration.
         *
         * @param {String} spec the sandbox id or tenant
         * @param {String} alias the alias name to register for the sandbox
         * @param {Boolean} unique optional flag to configure the alias to be unique, false by default
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        create : function (spec, alias, unique, asJson) {
            runForSandbox(spec, asJson, function (sandbox) {
                registerForSandbox(sandbox.id, alias, unique, function (err, result) {
                    if (err) {
                        if (asJson) {
                            console.json({error: err.message});
                        } else {
                            console.error(err.message);
                        }
                        return;
                    }
                    if (asJson) {
                        // only log sandbox alias details to console
                        console.json(result)
                    } else if (result.domainVerificationRecord) {
                        // it's a unique alias, display domain verification record required
                        console.prettyPrint(result);
                        console.log('Please point the domain (' + result.name + ') to one of the inbound IP ' +
                        'addresses and set the alias in your instance\'s site alias configuration (in Business ' +
                        'Manager at: Merchant Tools > SEO > Aliases). In addition set the domain verification ' +
                        '(' + result.domainVerificationRecord + ') as TXT record at domain or root level. The TXT ' +
                        'record is checked every 15 mins after which your created alias is usable.');
                    } else {
                        // open registration link automatically if in interactive mode
                        // assuming this is the case when --json flag is not used
                        console.prettyPrint(result);
                        doCookieRegistration(sandbox.realm, result.registration, alias);
                    }
                });
            });
        },

        /**
         * Reads a specific alias for a sandbox and forces a registration.
         *
         * @param {String} spec the sandbox id or tenant
         * @param {String} alias ID of the alias to read for the sandbox
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        get : function (spec, alias, asJson) {
            runForSandbox(spec, asJson, function (sandbox) {
                readAliasConfig(sandbox.id, alias, function (err, result) {
                    if (err) {
                        if (asJson) {
                            console.json({error: err.message});
                        } else {
                            console.error(err.message);
                        }
                        return;
                    }
                    if (asJson) {
                        console.json(result)
                    } else {
                        // open registration link automatically if in interactive mode
                        // assuming this is the case when --json flag is not used
                        console.prettyPrint(result);
                        doCookieRegistration(sandbox.realm, result.registration, alias);
                    }
                });
            });
        },

        /**
         * Lists all registered aliases for a sandbox.
         *
         * @param {String} spec the sandbox id or tenant
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        list : function (spec, asJson) {
            runForSandbox(spec, asJson, function (sandbox) {
                listForSandbox(sandbox.id, function (err, list) {
                    if (err) {
                        if (asJson) {
                            console.json({error: err.message});
                        } else {
                            console.error(err.message);
                        }
                        return;
                    }
                    printInboundIPs(sandbox.realm, asJson);
                    if (asJson) {
                        console.json(list);
                        return;
                    }
                    if (list.length === 0) {
                        console.info('No aliases found');
                        return;
                    }
                    // table fields
                    var data = [['id','name','status','registration','domainVerificationRecord']];
                    for (var i of list) {
                        data.push([i.id, i.name, i.status, i.registration,
                            i.domainVerificationRecord]);
                    }
                    console.table(data);
                });
            });
        },

        /**
         * Deletes an alias for a sandbox.
         *
         * @param {String} spec the sandbox id or tenant
         * @param {String} aliasId the alias ID to delete
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        delete : function (spec, aliasId, asJson) {
            runForSandbox(spec, asJson, function (sandbox) {
                unregisterForSandbox(sandbox.id, aliasId, function (err) {
                    if (err) {
                        if (asJson) {
                            console.json({error: err.message});
                        } else {
                            console.error(err.message);
                        }
                        return
                    }
                    if (asJson) {
                        console.json({success: true});
                    } else {
                        console.info('Success');
                    }
                });
            });
        }
    }
}