var request = require('request');
var util = require('util');

var auth = require('./auth');
var console = require('./log');
var ocapi = require('./ocapi');
var webdav = require('./webdav');

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

function activateVersion(instance, code_version, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/{code_version_id}'
    endpoint = endpoint.replace('{code_version_id}', code_version);

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);

    // the patch body
    options['body'] = { active : true };

    // just do the request and pass the callback
    request.patch(options, callback);
}

function activate(instance, code_version) {
    activateVersion(instance, code_version, auth.getToken(), function (err, res) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200 && !res.fault) {
                console.info('Code version %s activated on %s',
                    code_version, instance);
            } else if (res && res.body && res.body.fault && res.body.fault.type == 'CodeVersionModificationException') {
                console.warn('Code version %s already active on %s',
                    code_version, instance);
            } else {
                console.error('Activating code version %s on %s failed: %s (%s)',
                    code_version, instance, res.body.fault.type, res.body.fault.message);
            }
        }, function() {
            activate(instance, code_version);
        });
    });
}

function createVersion(instance, code_version, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/{code_version_id}'
    endpoint = endpoint.replace('{code_version_id}', code_version);

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);

    // just do the request and pass the callback
    request.put(options, callback);
}

function createCodeVersion(instance, code_version) {
    createVersion(instance, code_version, auth.getToken(), function (err, res) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200 && !res.fault) {
                console.info('Code version %s created on %s', code_version, instance);
            } else if (res && res.body && res.body.fault
                && res.body.fault.type == 'CodeVersionIdAlreadyExistsException') {
                console.warn('Code version %s already exists on %s', code_version, instance);
            } else {
                console.error('Creating code version %s on %s failed: %s (%s)',
                    code_version, instance, res.body.fault.type, res.body.fault.message);
            }
        }, function() {
            createCodeVersion(instance, code_version);
        });
    });
}

function listVersions(instance, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions'

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);

    // just do the request and pass the callback
    request.get(options, callback);
}

/**
 * Returns a list of all code version on the instance.
 *
 * @param {String} instance the instance to retrieve the list of code versions from
 * @param {Boolean} asJson whether to format the output as json, default is false
 * @param {String} sortBy the field to sort code versions by
 */
function list(instance, asJson, sortBy) {
    listVersions(instance, auth.getToken(), function (err, res) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200) {
                // apply sorting
                if (sortBy) {
                    res.body.data = require('./json').sort(res.body.data, sortBy);
                }
                if (asJson) {
                    console.json(res.body);
                    return;
                }
                renderCodeVersions(res.body);
                return;
            }
            // in case of errors
            var result = { error : 'Cannot read code versions', fault : res.body.fault };

            if (asJson) {
                console.json(result);
                return;
            }
            console.error(result['error']);
            console.debug(result['fault']);
        }, function() {
            list(instance, asJson, sortby);
        });
    });
}

function renderCodeVersions(code_versions) {
    // render totals
    console.info("Number of code versions: %s", code_versions.total);

    // render some details for each
    if (code_versions.total > 0) {
        var data = [['ID','Activation Time','Active','Compatibility Mode','Last Modification Time','Total Size']];
        for (var c of code_versions.data) {
            data.push([c.id,c.activation_time,c.active,c.compatibility_mode,c.last_modification_time,c.total_size]);
        }

        console.table(data);
    }
}

module.exports.createVersion = createCodeVersion;
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
     * Create a custom code version onto a Commerce Cloud instance
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} code_version The name of the code version to create
     * @param {String} token The Oauth token to use for authentication
     * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
     * @param {Function} callback Callback function executed as a result. The job execution details and the error will be passed as parameters to the callback function.
     */
    createCodeVersion : function (instance, code_version, token, options, callback) {
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
        if (typeof(options) !== 'object') {
            options = {};
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback is missing or not of type Function');
        }

        createVersion(instance, code_version, token, function (err, res) {
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
     * Get all custom code versions deployed on a Commerce Cloud instance.
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The error and the code versions will be passed as parameters to the callback function.
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
                    callback(undefined, res.body);
                    return;
                }

                // any errors
                callback(new Error(err), undefined);
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
     * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
     * @param {Function} callback Callback function executed as a result. The error will be passed as parameter to the callback function.
     */
    deploy: function (instance, archive, token, options, callback) {
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
        if (typeof(options) !== 'object') {
            options = {};
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback is missing or not of type Function');
        }

        webdav.deployCodeAPI(instance, archive, token, options, callback);
    }
};