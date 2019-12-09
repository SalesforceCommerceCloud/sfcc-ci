var fs = require('fs');
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

/**
 * Activates a custom code version on an instance.
 *
 * @param {String} instance instance to activate the code versions on
 * @param {String} version the code version to activate
 * @param {String} token oauth token
 * @param {Function} callback callback function to execute
 */
function activateVersion(instance, version, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/' + version;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token, 'PATCH');

    // the patch body
    options['body'] = { active : true };

    // just do the request and pass the callback
    request(options, callback);
}

/**
 * Retrieves a list of all code versions from an instance.
 *
 * @param {String} instance instance to retrieve code versions from
 * @param {String} token oauth token
 * @param {Function} callback callback function to execute
 */
function getVersions(instance, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions'

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);

    // just do the request and pass the callback
    request.get(options, callback);
}

/**
 * Renders a list of code versions in human readable way and writes output to the console.
 *
 * @param {Array} code_versions List of code versions to render
 */
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

/**
 * Deploys a new code version to an instance.
 *
 * @param {String} instance The instance to deploy code to
 * @param {String} archive The path to the ZIP archive to deploy
 * @param {String} token oauth token
 * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
 * @param {Function} callback Callback function to execute, with the error as parameter passed
 */
function deployCode(instance, archive, token, options, callback) {
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

    var file = archive;

    // check if file exists locally
    if (!fs.existsSync(file)) {
        callback(new Error(`File "${file}" does not exist`));
        return;
    } else {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
            callback(new Error(`File "${file}" does not exist or is not a file`));
            return;
        }
    }

    // by default we do not ignore local file paths for code upload
    // this will acknowledge any dirs and sub dirs and will retain them
    // when deploying code onto the server (e.g. it will create those dirs
    // and sub dirs if they do not exist)
    var ignoreLocalFilePath = false;
    // however, if we upload a zipped custom code file, we ignore the local
    // path forcing the zip file to be uploaded to the webdav code repo as is
    if (require('path').extname(file) === '.zip') {
        ignoreLocalFilePath = true;
    }

    // initiate the post request first...
    webdav.postFile(instance, webdav.WEBDAV_CODE, file, token, ignoreLocalFilePath, options, function (err, res, body) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
            if (res && res.statusCode >= 400) {
                callback(new Error(`Deploy code ${file} failed (upload step): `
                    + `${res.statusCode} (${res.statusMessage})`));
                return;
            } else if (err) {
                callback(new Error(`Deploy code ${file} failed (upload step): ${err}`));
                return;
            }
            // ...and unzip the archive afterwards
            webdav.unzip(instance, webdav.WEBDAV_CODE, file, token, ignoreLocalFilePath, options,
                function (err, res, body) {
                    // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
                    if (res && res.statusCode >= 400) {
                        callback(new Error(`Deploy code ${file} failed (unzip step): `
                            + `${res.statusCode} (${res.statusMessage})`));
                        return;
                    } else if (err) {
                        callback(new Error(`Deploy code ${file} failed (unzip step): ${err}`));
                        return;
                    }

                    // this assumes that archive file carries the same name as the packaged code version
                    var newVersion = require('path').basename(file);
                    if (ignoreLocalFilePath) {
                        newVersion = require('path').basename(file, '.zip');
                    }

                    // If the code is successfully deployed, we need to remove the uploaded ZIP file
                    webdav.deleteFile(instance, webdav.WEBDAV_CODE, file, token, ignoreLocalFilePath, options,
                        function(err, res, body) {
                            if (err) {
                                callback(new Error(`Delete ZIP file ${file} after deployment `
                                    + `failed (deleteFile step): ${err}`));
                                return;
                            } else {
                                if (res && res.statusCode === 204) {
                                    callback(undefined, newVersion);
                                    return;
                                } else {
                                    callback(new Error(`Delete ZIP file ${file} after deployment failed
                                        (deleteFile step): ${res.statusCode} (${res.statusMessage})`));
                                }
                            }
                        });
                });
        }, function() {
            deployCode(instance, archive, token, options, callback);
        });
    });
}

/**
 * Deletes an existing code version
 *
 * @param {String} instance the instance to delete the code version from
 * @param {String} version the code version to delete
 * @param {Function} callback the callback to execute, the error is available as argument to the callback function
 */
function deleteCodeVersion(instance, version, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/' + version;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, auth.getToken(), 'DELETE');

    // do the request
    request(options, function (err, res, body) {
        var errback = ocapi.captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Deleting code version %s failed: %s', version, err)));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Deleting code version %s failed: %s', version, res.statusCode)));
            return;
        }
        // do the callback without error
        callback(undefined);
    });
}

module.exports.cli = {
    /**
     * Returns a list of all code version on the instance.
     *
     * @param {String} instance the instance to retrieve the list of code versions from
     * @param {Boolean} asJson whether to format the output as json, default is false
     * @param {String} sortBy the field to sort code versions by
     */
    list : function (instance, asJson, sortBy) {
        getVersions(instance, auth.getToken(), function (err, res) {
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
    },

    /**
     * Deploys a new code version to an instance with optional code activation.
     *
     * @param {String} instance The instance to deploy code to
     * @param {String} archive The path to the ZIP archive to deploy
     * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
     * @param {Boolean} activate Whether to activate the uploaded code version or not, false by default
     */
    deploy : function (instance, archive, options, activate) {
        deployCode(instance, archive, auth.getToken(), options, function(err, newVersion) {
            if (err) {
                console.error(err.message);
            } else if (!activate) {
                console.info('Code archive %s successfully deployed to %s. You may activate the code by running ' +
                    '`sfcc-ci code:activate %s -i %s`.', file, instance, newVersion, instance);
            } else {
                console.info('Code archive %s successfully deployed to %s.', file, instance);
            }
            // optionally activate
            if (!err && activate) {
                module.exports.cli.activate(instance, newVersion);
            }
        });
    },

    /**
     * Activate the custom code version on an instance.
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} code_version The code version to activate
     */
    activate : function (instance, code_version) {
        activateVersion(instance, code_version, auth.getToken(), function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 && !res.fault) {
                    console.info('Code version %s activated on %s',
                        code_version, instance);
                } else if (res && res.body && res.body.fault &&
                    res.body.fault.type == 'CodeVersionModificationException') {
                    console.warn('Code version %s already active on %s',
                        code_version, instance);
                } else {
                    console.error('Activating code version %s on %s failed: %s (%s)',
                        code_version, instance, res.body.fault.type, res.body.fault.message);
                }
            }, function() {
                module.exports.cli.activate(instance, code_version);
            });
        });
    },

    /**
     * Delete a code version
     *
     * @param {String} instance the instance to delete the code version from
     * @param {String} version the code version to delete
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    delete : function(instance, version, asJson) {
        deleteCodeVersion(instance, version, function(err) {
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
                message : util.format('Code version %s deleted from %s.', version, instance),
            };

            if (asJson) {
                console.json(result);
                return;
            }

            console.info(result['message']);
        });
    }
};
module.exports.api = {
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
        getVersions(instance, token, function (err, res) {
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
        deployCode(instance, archive, token, options, callback);
    },

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
    }
};