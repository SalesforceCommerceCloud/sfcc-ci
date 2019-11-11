var request = require('request');
var util = require('util');

// required for sandbox alias cookie registration
var open = require('open');
var console = require('./log');
var ocapi = require('./ocapi');
var readline = require('readline');

const API_HOST_DEFAULT = 'admin.us01.dx.commercecloud.salesforce.com';
const API_HOST = getAPIHost();
const API_BASE = API_HOST + '/api/v1';
const API_SANDBOXES = API_BASE + '/sandboxes';
const API_SYSTEM = API_BASE + '/system';

// enable request debugging
if (process.env.DEBUG) {
    require('request-debug')(request);
}

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
 * Utility function to lookup the sandbox API host name. By default it is the host name
 * defined as API_HOST_DEFAULT. The default API host can be overwritten using the environment
 * variable SFCC_SANDBOX_API_HOST.
 *
 * @return {String} the API host name
 */
function getAPIHost() {
    // check on env var and return it if set
    if (process.env.SFCC_SANDBOX_API_HOST) {
        console.debug('Using alternative sandbox API host %s defined in env var `SFCC_SANDBOX_API_HOST`',
            process.env.SFCC_SANDBOX_API_HOST);
        return process.env.SFCC_SANDBOX_API_HOST;
    }
    // return the default host otherwise
    return API_HOST_DEFAULT;
}

/**
 * Prints the inbound IP addresses of the cluster on the console.
 */
function printInboundIPs(json){
    var options = ocapi.getOptions('GET', API_SYSTEM);

    ocapi.retryableCall('GET', options, function (err, res) {
        if (err) {
            console.error(err)
        } else if (res.statusCode >= 400) {
            console.error(res.body)
        } else {
            if (json) {
                console.json(res.body.data.inboundIps);
                return;
            }
            console.log('')
            for (var i in res.body.data.inboundIps) {
                console.log('IP'+i+': '+res.body.data.inboundIps[i])
            }
        }
    });
}

/**
 * Calls the given alias registration link in the browser after printing the inbound cluster IPs.
 */
function doCookieRegistration(link) {
    printInboundIPs();
    (async() => {
        await askQuestion("Please point the domain in your etc/hosts to one of these IPs and set the "
            + "alias inyour instance's site alias config. Press Enter when ready.");
        open(link)
    })();
}

/**
 * Register a hostname alias for a sandbox.
 *
 * @param sbxID ID of the sandbox to create alias for
 * @param alias name of the alias to create
 * @param {Function} callback the callback to execute, the error and the created alias are available as arguments to the callback function
 */
function registerForSandbox(sbxID, alias, callback) {
    // the payload
    var options = ocapi.getOptions('POST', API_SANDBOXES + '/' + sbxID + '/aliases');
    options['body'] = {name: alias};

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
        if (err) {
            callback(new Error(util.format('Deleting sandbox aliases failed: %s', err)));
        } else if (res.statusCode === 404) {
            callback(undefined);
        } else if (res.statusCode >= 400) {
            if (res.body && res.body.error) {
                callback(new Error(util.format('Deleting sandbox aliases failed: %s', res.body.error.message)));
            } else {
                callback(new Error('Invalid Alias ID'));
            }
        } else {
            callback(undefined);
        }
    });
}

module.exports.cli = {
    alias: {
        /**
         * Registers an alias for a sandbox  and forces a registration.
         *
         * @param {String} sandbox the sandbox id
         * @param {String} alias the alias name to register for the sandbox
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        create: function (sandbox, alias, asJson) {
            registerForSandbox(sandbox. alias, function (err, result) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }
                console.prettyPrint(result);
                doCookieRegistration(result.registration);
            });
        },
        /**
         * Reads a specific alias for a sandbox and forces a registration.
         *
         * @param {String} sandbox the sandbox id
         * @param {String} alias ID of the alias to read for the sandbox
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        get: function (sandbox, alias, asJson) {
            readAliasConfig(sandbox, alias, function (err, result) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }
                console.prettyPrint(result);
                doCookieRegistration(result.registration);
            });
        },
        /**
         * Lists all registered aliases for a sandbox.
         *
         * @param {String} sandbox the sandbox id
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        list: function (sandbox, asJson) {
            listForSandbox(sandbox, function (err, list) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }
                printInboundIPs();
                if (asJson) {
                    console.json(list);
                    return;
                }
                if (list.length === 0) {
                    console.info('No aliases found');
                    return;
                }
                // table fields
                var data = [['id','name','sandbox','register']];
                for (var i of list) {
                    data.push([i.id, i.name, i.sandboxId, i.registration]);
                }
                console.table(data);
            });
        },
        /**
         * Deletes an alias for a sandbox.
         *
         * @param {String} sandbox the sandbox id
         * @param {String} aliasId the alias ID to remove
         * @param {Boolean} asJson optional flag to force output in json, false by default
         */
        remove: function (sandbox, aliasId, asJson) {
            unregisterForSandbox(sandbox, aliasId, function (err) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return
                }
                console.info('Success');
            });
        }
    }
}
