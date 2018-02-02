var request = require('request');

var auth = require('./auth');
var config = require('./config').obtain();
var dwjson = require('./dwjson').init();
var job = require('./job');
var console = require('./log');
var ocapi = require('./ocapi');
var webdav = require('./webdav');

const ENDPOINT_META = '/s/-/dw/meta/v1/rest';

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
            return all[i].instance;
        }
    }
    return null;
}

/**
 * Sets the passed instance as the default instance used with the CLI.
 *
 * @param {String} instance the instance to set as default
 */
function setInstance(instance) {
    config.set('default_instance', instance);
    console.info('Instance %s set as default.', instance);
}

/**
 * Adds the passed instance to the list of instances used with the CLI. If parameter
 * alias was passed, the CLI is able to lookup the instance using this alias for any instance
 * specific command.
 *
 * @param {String} instance the instance to add to the list
 * @param {String} alias the alias to use for this instance
 */
function addInstance(instance, alias) {
    // get the persisted list of instances
    var instances = config.get('instances');
    if ( !Array.isArray(instances) ) {
        instances = [];
    }
    // search for a duplicate (by instance only)
    var instanceDuplicates = instances.filter(function(i) {
        return ( i.instance === instance );
    });
    // do not allow duplicate instances
    if ( instanceDuplicates.length > 0 ) {
        console.warn('Instance %s already defined. Skipping.', instance);
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

            console.info('Alias "%s" already in use. Alias reset and set for new instance %s.', alias, instance);
        }
    }

    // add the brand new instance
    instances.push({ alias : ( alias ? alias : null ), instance : instance });
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
    var instances = config.get('instances');
    if ( !Array.isArray(instances) ) {
        return [];
    }
    // extend with default property
    instances.forEach(function(i) {
        i['default'] = ( getInstance() === i['instance'] ? true : false );
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
    var data = { auth : { client_id : auth.getClient() }, default_instance : getInstance() };

    // client details
    var out = [['Client ID', ( auth.getClient() ? auth.getClient() : '(not set)' )]];
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
    var out = [['Alias','Instance','Default']];
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
        out.push([i.alias,i.instance,( i.default ? 'Yes' : '' )]);
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
module.exports.setDefault = setDefault;
module.exports.getInstance = getInstance;
module.exports.list = list;
module.exports.clearAll = clearAll;
module.exports.saveState = saveState;
module.exports.saveStateSync = saveStateSync;
module.exports.resetState = resetState;
module.exports.resetStateSync = resetStateSync;
module.exports.import = runImport;
module.exports.importSync = runImportSync;
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