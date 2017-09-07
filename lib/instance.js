var request = require('superagent');
var {table} = require('table');

var auth = require('./auth');
var config = require('./config').obtain();
var job = require('./job');

const ENDPOINT_META = '/s/-/dw/meta/v1/rest';

function add(instance, alias) {
    // progress
    var spinner = new require('cli-spinner').Spinner('Processing... %s')
    spinner.start();

    // attempt to reach the instance
    request
        .get('https://' + instance + ENDPOINT_META)
        .end(function (err, res) {
            spinner.stop(true);
            if (res && res.statusCode != 404) {
                // persist the instance
                addInstance(instance, alias);
                setInstance(instance);
                console.log('Instance "%s" added successfully using alias "%s"', instance, alias);
            } else {
                console.error('Error: Adding instance "%s" failed: %s', instance, err);
            }
        });
}

function setDefault(alias) {
    var instance = lookupInstance(alias);
    if (instance) {
        setInstance(instance);
        console.log('Instance with alias "%s" (%s) set as new default instance.', alias, instance);
    } else {
        console.error('Error: Setting default instance failed. Instance with alias "%s" unknown.', alias);
    }
}

function getInstance(alias) {
    if (!alias) {
        return config.get('SFCC_INSTANCE');
    }
    return lookupInstance(alias);
}

function lookupInstance(alias) {
    var all = getAllInstances();
    for (var i=0; i<all.length; i++) {
        if (all[i].alias == alias) {
            return all[i].instance;
        }
    }
}

function setInstance(instance) {
    config.set('SFCC_INSTANCE', instance);
}

function addInstance(instance, alias) {
    config.set('SFCC_INSTANCES_' + ( alias ? alias : instance ), instance);
}

function getAllInstances() {
    var list = [];
    for (var value of config) {
        if (value[0].indexOf('SFCC_INSTANCES_') !== 0) {
            continue;
        }
        list.push({instance:value[1],alias:value[0].replace('SFCC_INSTANCES_',''),key:value[0]});
    }
    return list;
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
    var all = getAllInstances();
    for (var i=0; i<all.length; i++) {
        config.delete(all[i].key);
    }
    config.delete('SFCC_INSTANCE');
    console.log('Instance configuration sucessfully cleared.');
}

function runImport(instance, file_name) {
    job.run(instance, 'sfcc-site-archive-import', {
        file_name : file_name
    });
}

function saveState(instance) {
    job.run(instance, 'sfcc-save-instance-state', null);
}

function resetState(instance) {
    job.run(instance, 'sfcc-reset-instance-state', null);
}

module.exports.add = add;
module.exports.setDefault = setDefault;
module.exports.getInstance = getInstance;
module.exports.lookupInstance = lookupInstance;
module.exports.list = list;
module.exports.clearAll = clearAll;
module.exports.saveState = saveState;
module.exports.resetState = resetState;
module.exports.import = runImport;
module.exports.api = {
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
        job.runJob(instance, job_id, { parameters : job_params }, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && ( res.statusCode == 200 || res.statusCode == 202 ) && !res.fault) {
                    // if successful, callback with execution details
                    callback(res.body, undefined);
                    return;
                }

                // in case of errors, callback with err
                callback(undefined, new Error(err));
                return;
            });
        });
    }
};