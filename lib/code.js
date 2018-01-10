var request = require('superagent');
var {table} = require('table');

var auth = require('./auth');
var console = require('./log');
var ocapi = require('./ocapi');
var webdav = require('./webdav');
var progress = require('./progress');

function activateVersion(instance, code_version, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/{code_version_id}'
    endpoint = endpoint.replace('{code_version_id}', code_version);

    request
        .patch('https://' + instance + endpoint)
        .set('Authorization', 'Bearer ' + token)
        .send({active:true})
        .end(callback);
}

function activate(instance, code_version) {
    // progress
    progress.start();

    activateVersion(instance, code_version, auth.getToken(), function (err, res) {
        progress.stop();
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200 && !res.fault) {
                console.log('Custom code version "%s" successfully activated on instance "%s"',
                    code_version, instance);
            } else if (res.body.fault.type == 'CodeVersionModificationException') {
                console.warn('Custom code version "%s" already active on instance "%s"',
                    code_version, instance);
            } else {
                console.error('Activating custom code version "%s" on instance "%s" has failed: %s (%s)',
                    code_version, instance, res.body.fault.type, res.body.fault.message);
                process.exitCode = 1;
            }
        }, function() {
            activate(instance, code_version);
        });
    });
}

function listVersions(instance, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions'

    request
        .get('https://' + instance + endpoint)
        .set('Authorization', 'Bearer ' + token)
        .send()
        .end(callback);
}

function list(instance) {
    // progress
    progress.start();

    listVersions(instance, auth.getToken(), function (err, res) {
        progress.stop();
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200) {
                renderCodeVersions(res.body);
            } else {
                console.error('Reading custom code versions from instance "%s" has failed: %s (%s)',
                    instance, res.body.fault.type, res.body.fault.message);
                process.exitCode = 1;
            }
        }, function() {
            list(instance);
        });
    });
}

function renderCodeVersions(code_versions) {
    // render totals
    console.log("Number of code versions on the instance: %s", code_versions.total);

    // render some details for each
    if (code_versions.total > 0) {
        var data = [['ID','Activation Time','Active','Compatibility Mode','Last Modified','Size']];
        for (var c of code_versions.data) {
            data.push([c.id,c.activation_time,c.active,c.compatibility_mode,c.last_modification_time,c.total_size]);
        }

        console.log(table(data, {}));
    }
}

module.exports.activate = activate;
module.exports.list = list;
module.exports.api = {
    /**
     * Activate the custom code version on a Commerce Cloud instance. If the code version is already
     * active, no error is available.
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} code_version The code version to activate
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The error will be passed as parameter to the callback function.
     */
    activate : function (instance, code_version, token, callback) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance is missing or not of type String');
        }
        if (typeof(code_version) !== 'string') {
            throw new TypeError('Parameter code_version is missing or not of type String');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token is missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback is missing or not of type Function');
        }
        activateVersion(instance, code_version, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 && !res.fault) {
                    // Success
                    callback(undefined);
                    return;
                } else if (res.statusCode == 400 && res.body.fault.type == 'CodeVersionModificationException') {
                    // Exception: Code version already active won't end up in error
                    callback(undefined);
                    return;
                }

                callback(new Error(err));
                return;
            });
        });
    },

    /**
     * Get all custom code versions deployed on a Commerce Cloud instance.
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The job execution details and the error will be passed as parameters to the callback function.
     */
    list : function (instance, token, callback) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance is missing or not of type String');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token is missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback is missing or not of type Function');
        }
        listVersions(instance, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 && !res.fault) {
                    // Success
                    callback(res.body, undefined);
                    return;
                }

                // any errors
                callback(undefined, new Error(err));
                return;
            });
        });
    },

    /**
     * Deploys a custom code archive onto a Commerce Cloud instance
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} archive The path to the ZIP archive to deploy
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The job execution details and the error will be passed as parameters to the callback function.
     */
    deploy: function (instance, archive, token, callback) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance is missing or not of type String');
        }
        if (typeof(archive) !== 'string') {
            throw new TypeError('Parameter archive is missing or not of type String');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token is missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback is missing or not of type Function');
        }

        webdav.deployCodeAPI(instance, archive, token, callback);
    }
};