var request = require('request');

var auth = require('./auth');
var config = require('./config').obtain();
var dwjson = require('./dwjson').init();
var job = require('./job');
var console = require('./log');
var ocapi = require('./ocapi');
var webdav = require('./webdav');

const ENDPOINT_META = '/s/-/dw/meta/v1/rest';

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

/**
 * Retrieves the unfiltered, configured list of instances as is.
 *
 * @return {Object} the instances configuration value
 */
function getConfiguredInstances() {
    var instances = config.get('instances');
    if ( !Array.isArray(instances) ) {
        instances = [];
    } else {
        var patched = false;
        // if array, patch and rename key 'instance' to 'host'
        instances.forEach(function(value, i, array) {
            if (value.hasOwnProperty('instance')) {
                array[i]['host'] = array[i]['instance'];
                delete array[i]['instance'];
                patched = true;
            }
        });
        // if patched, persist
        if (patched) {
            config.set('instances', instances);
        }
    }
    return instances;
}

/**
 * Adds the passed instance to the list of instances used with the CLI. If parameter
 * alias was passed, the CLI is able to lookup the instance using this alias for any instance
 * specific command.
 *
 * @param {String} instance the instance to add
 * @param {String} alias the alias for the instance to add
 * @param {Boolean} asDefault set instance as new default, false by default
 */
function add(instance, alias, asDefault) {
    // build the request options
    var options = ocapi.getOptions(instance, ENDPOINT_META, null);

    // just do the request and pass the callback
    request.get(options, function (err, res) {
        if (res && res.statusCode != 404) {
            // persist the instance
            addInstance(instance, alias);
            // set it as new default
            if (asDefault) {
                setInstance(instance);
            }
            console.info('Instance configuration updated');
        } else {
            console.error('Adding instance %s failed: %s', instance, err);
            process.exitCode = 1;
        }
    });
}

// TODO with callback and extract into cli and worker function for higher level operations using this
function setDefault(alias) {
    var instance = lookupInstance(alias);
    if (instance) {
        setInstance(instance);
    } else {
        console.error('Setting default instance failed. Instance with alias "%s" unknown.', alias);
        process.exitCode = 1;
    }
}

/**
 * TODO Hardening this as it is returning an unexisting instance if nothing found
 *
 * @param {String} aliasOrHost alias or host name of the instance to return
 * @return {String} the instance being determined
 */
function getInstance(aliasOrHost) {
    // in case aliasOrHost wasn't passed
    if (!aliasOrHost) {
        // check for default instance and return this
        if ( config.get('default_instance') ) {
            return config.get('default_instance');
        }

        // or check for an instance in a dw.json file
        if ( dwjson['hostname'] ) {
            return dwjson['hostname'];
        }

        return null;
    }
    // attempt to lookup instance
    var instance = lookupInstance(aliasOrHost);
    if (instance) {
        return instance;
    }

    // otherwise just return the aliasOrHost assuming it is an unconfigured host
    return aliasOrHost;
}

/**
 * Utility function to lookup an instance host name by this alias. Will search within
 * the list of configured instances.
 *
 * @param {String} alias the alias of the instance to look up
 * @return {String} the instance host name being determined
 */
function lookupInstance(alias) {
    var all = getAllInstances();
    for (var i=0; i<all.length; i++) {
        if (all[i].alias == alias) {
            return all[i].host;
        }
    }
    return null;
}

/**
 * Utility function to get instance details for the instance with the passed host name.
 * Will search within the list of configured instances.
 *
 * @param {String} host the host name of the instance to get details for
 * @return {Object} the instance details
 */
function getInstanceDetails(host) {
    var all = getAllInstances();
    for (var i=0; i<all.length; i++) {
        if (all[i].host == host) {
            return all[i];
        }
    }
    return null;
}

/**
 * Sets the passed instance as the default instance used with the CLI. If instance is null
 * the default instance will be reset.
 *
 * @param {String} instance the instance to set as default
 * @param {Function} callback optional callback function
 */
function setInstance(instance, callback) {
    config.set('default_instance', instance);
    if ( callback ) {
        callback();
    } else {
        console.info('Instance %s set as default.', instance);
    }
}

/**
 * Adds the passed host name to the list of instances used with the CLI. If parameter
 * alias was passed, the CLI is able to lookup the instance using this alias for any instance
 * specific command.
 *
 * @param {String} host the host name of the instance to add to the list
 * @param {String} alias the alias to use for this instance
 */
function addInstance(host, alias) {
    // get the persisted list of instances
    var instances = getConfiguredInstances();
    if ( !Array.isArray(instances) ) {
        instances = [];
    }
    // search for a duplicate (by host only)
    var instanceDuplicates = instances.filter(function(i) {
        return ( i.host === host );
    });
    // do not allow duplicate instances
    if ( instanceDuplicates.length > 0 ) {
        console.warn('Instance %s already defined. Skipping.', host);
        return;
    }

    if (alias) {
        // search for a duplicate (by alias only)
        var aliasDuplicates = instances.filter(function(i) {
            return ( i.alias === alias );
        });
        // do not allow duplicate alias
        if ( aliasDuplicates.length > 0 ) {
            // null alias
            instances.forEach(function(i) {
                if ( i['alias'] === alias ) {
                    i['alias'] = null;
                }
            });

            console.info('Alias "%s" already in use. Alias reset and set for new instance %s.', alias, host);
        }
    }

    // add the brand new instance
    instances.push({ alias : ( alias ? alias : null ), host : host });
    // persist
    config.set('instances', instances);
}

/**
 * Returns all instances currently configured with the CLI.
 *
 * @return {Object[]} an array containing all instances
 */
function getAllInstances() {
    // get the persisted list of instances
    var instances = getConfiguredInstances();
    if ( !Array.isArray(instances) ) {
        return [];
    }
    // extend with default property
    instances.forEach(function(i) {
        i['default'] = ( getInstance() === i['host'] ? true : false );
    });
    return instances;
}

/**
 * List details of all instances currently configured and renders them to the console.
 *
 * @param {Boolean} verbose return more, detailed information
 * @param {Boolean} asJson format output as json
 */
function list(verbose, asJson) {
    var data = { auth : { client_id : auth.getClient(), user : auth.getUser() }, default_instance : getInstance() };

    // client/user details
    var out = [['Client ID', ( auth.getClient() ? auth.getClient() : '(not set)' )]];
    out.push(['User', ( auth.getUser() ? auth.getUser() : '(not set)' )]);

    if (verbose) {
        data['auth']['access_token'] = auth.getToken();
        data['auth']['auto_renew_token'] = auth.getAutoRenewToken();

        out.push(['Oauth Token', ( auth.getToken() ? '(set)' : '(not set)' )]);
        out.push(['Auto Renew Token', ( auth.getAutoRenewToken() ? 'Yes' : 'No' )]);
    }
    out.push(['Default Instance', ( getInstance() ? getInstance() : '(not set)' )]);

    // append if to be formatted as json
    if (!asJson) {
        console.table(out);
    }

    // instance details
    var out = [['Alias','Host','Default']];
    var list = getAllInstances();

    // append and render all as json
    if (asJson) {
        data['instances'] = list;
        console.log(JSON.stringify(data));
        return;
    }

    if (list.length == 0) {
        out.push(['(not set)','(not set)','(not set)']);
    }
    for (var i of list) {
        out.push([i.alias,i.host,( i.default ? 'Yes' : '' )]);
    }

    console.table(out);
}

function clearAll() {
    config.delete('instances');
    config.delete('default_instance');
    console.info('Instance configuration cleared.');
}

function runImport(instance, file_name) {
    job.run(instance, 'sfcc-site-archive-import', {
        file_name : file_name
    });
}

function runImportSync(instance, file_name) {
    job.runSync(instance, 'sfcc-site-archive-import', {
        file_name : file_name
    });
}

function saveState(instance) {
    job.run(instance, 'sfcc-save-instance-state', null);
}

function saveStateSync(instance) {
    job.runSync(instance, 'sfcc-save-instance-state', null);
}

function resetState(instance) {
    job.run(instance, 'sfcc-reset-instance-state', null);
}

function resetStateSync(instance) {
    job.runSync(instance, 'sfcc-reset-instance-state', null);
}

module.exports.add = add;
module.exports.addInstance = addInstance;
module.exports.lookupInstance = lookupInstance;
module.exports.setDefault = setDefault;
module.exports.getInstance = getInstance;
module.exports.getInstanceDetails = getInstanceDetails;
module.exports.list = list;
module.exports.clearAll = clearAll;
module.exports.saveState = saveState;
module.exports.saveStateSync = saveStateSync;
module.exports.resetState = resetState;
module.exports.resetStateSync = resetStateSync;
module.exports.import = runImport;
module.exports.importSync = runImportSync;
module.exports.config = {
    /**
     * Removes an instance from the list of configured instances by its host name. If the instance
     * to remove is the default instance, the default instance will be reset.
     *
     * @param {String} host the host name to identify the instance to remove from the configuration
     */
    removeInstance : function (host) {
        // get the persisted list of instances
        var instances = getConfiguredInstances();
        if ( !Array.isArray(instances) ) {
            return;
        }
        // check if instance is the default instance
        var details = getInstanceDetails(host);
        if (details && details.default) {
            // and reset default instance if needed
            setInstance(null, function(){});
        }
        // search for any instance, an exclude the one to remove
        var remainingInstances = instances.filter(function(i) {
            return ( i.host !== host );
        });
        // persist
        config.set('instances', remainingInstances);
    }
};
module.exports.api = {
    /**
     * Uploads an instance import file onto a Commerce Cloud instance.
     *
     * @param {String} instance The instance to upload the import file to
     * @param {String} file The file to upload
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The error will be passed as parameter to the callback function.
     */
    upload : function (instance, file, token, callback) {
        webdav.api.upload(instance, webdav.WEBDAV_INSTANCE_IMPEX, file, token, callback);
    },

    /**
     * Perform an instance import (aka site import) on a Commerce Cloud instance. You may use
     * the API function job.status to get the execution status of the import.
     *
     * @param {String} instance Instance to start the import on
     * @param {String} file_name The import file to run the import with
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} success Callback function executed as a result. The job execution details and the error will be passed as parameters to the callback function.
     */
    import : function (instance, file_name, token, callback) {
        job.api.run(instance, 'sfcc-site-archive-import', { file_name: file_name }, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && ( res.statusCode == 200 || res.statusCode == 202 ) && !res.fault) {
                    // if successful, callback with execution details
                    callback(res.body, undefined);
                    return;
                }

                // Handle Errors
                if (res.text) {
                    callback(JSON.parse(res.text), err);
                } else {
                    callback(undefined, err);
                }

                return;
            });
        });
    }
};