var request = require('superagent');
var {table} = require('table');

var auth = require('./auth');
var config = require('./config').obtain();
var job = require('./job');
var console = require('./log');
var progress = require('./progress');
var ocapi = require('./ocapi');
var webdav = require('./webdav');

const ENDPOINT_META = '/s/-/dw/meta/v1/rest';

function add(instance, alias) {
    // progress
    progress.start();

    // attempt to reach the instance
    request
        .get('https://' + instance + ENDPOINT_META)
        .end(function (err, res) {
            progress.stop();
            if (res && res.statusCode != 404) {
                // persist the instance
                addInstance(instance, alias);
                // set it as new default
                setInstance(instance);
                console.log('Instance "%s" added successfully using alias "%s". Using "%s" as new default instance.', instance, alias, alias);
            } else {
                console.error('Adding instance "%s" failed: %s', instance, err);
                process.exitCode = 1;
            }
        });
}

function setDefault(alias) {
    var instance = lookupInstance(alias);
    if (instance) {
        setInstance(instance);
        console.log('Instance with alias "%s" (%s) set as new default instance.', alias, instance);
    } else {
        console.error('Setting default instance failed. Instance with alias "%s" unknown.', alias);
        process.exitCode = 1;
    }
}

function getInstance(aliasOrHost) {
    if (!aliasOrHost) {
        // return the current instance
        return config.get('default_instance');
    }
    // attempt to lookup instance
    var instance = lookupInstance(aliasOrHost);
    if (instance) {
        return instance;
    }

    // otherwise just return the aliasOrHost assuming it is an unconfigured host
    return aliasOrHost;
}

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
    // add the new instance
    instances.push({ alias : ( alias ? alias : instance ), instance : instance });
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
    return instances;
}

function list(verbose) {
    // client details
    var data = [['Client ID', ( auth.getClient() ? auth.getClient() : '(not set)' )]];
    if (verbose) {
        data.push(['Oauth Token', ( auth.getToken() ? auth.getToken() : 'N/A' )]);
        data.push(['Auto Renew Token', ( auth.getAutoRenewToken() ? 'Yes' : 'No' )]);
    }
    data.push(['Current Instance', ( getInstance() ? getInstance() : '(not set)' )]);

    console.log(table(data, {
        columns: {
            0: {
                width: 20
            },
            1: {
                width: 70
            }
        }
    }));

    // instance details
    var data = [['Alias','Instance']];
    var list = getAllInstances();
    if (list.length == 0) {
        data.push(['(empty)','(empty)']);
    }
    for (var i of list) {
        data.push([i.alias,i.instance]);
    }

    console.log(table(data, {
        columns: {
            0: {
                width: 25
            },
            1: {
                width: 65
            }
        }
    }));
}

function clearAll() {
    config.delete('instances');
    config.delete('default_instance');
    console.log('Instance configuration sucessfully cleared.');
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