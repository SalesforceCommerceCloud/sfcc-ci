/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var fs = require('fs');
var request = require('request');

var auth = require('./auth');
var dwjson = require('./dwjson').init();
var ocapi = require('./ocapi');
var console = require('./log');

const WEBDAV_BASE = '/on/demandware.servlet/webdav/Sites';
const WEBDAV_INSTANCE_IMPEX = '/impex/src/instance';
const WEBDAV_CODE = '/cartridges';

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

function getOptions(instance, path, token, options, method) {
    // the endpoint including the relative path on the instance's file system to upload to
    var endpoint = WEBDAV_BASE + path;

    var opts = {
        baseUrl: 'https://' + instance,
        uri: endpoint,
        auth: {
            bearer: ( token ? token : null )
        },
        strictSSL: true,
        method: method
    };
    // allow self-signed certificates, if needed
    if ( dwjson['self-signed'] || process.env.SFCC_ALLOW_SELF_SIGNED) {
        opts['strictSSL'] = false;

        console.warn('Allow self-signed certificates. Be caucious as this may expose secure information to an ' +
            'untrusted party.');
    }
    // allow client certificate and related passphrase if provided
    if (options && options.pfx && fs.existsSync(options.pfx)) {
        var stat = fs.statSync(options.pfx);
        if (stat.isFile()) {
            opts.agentOptions = {
                secureProtocol: 'TLSv1_2_method',
                pfx: fs.readFileSync(options.pfx),
                passphrase: options.passphrase // as passphrase is optional, it can be undefined here
            };
        }
    }

    return opts;
}

function postFile(instance, path, file, token, ignoreLocalFilePath, options, callback) {
    // append file to post to request uri
    // we preserve the local file path, if any passed with the file
    // if needed, extract the base file name from the potentially passed file path
    // this will upload the file into the passed (remote) path as is and will
    // not create any remote folders
    if (ignoreLocalFilePath) {
        path += '/' + require('path').basename(file);
    } else {
        path += '/' + file;
    }

    // build the request options
    var opts = getOptions(instance, path, token, options, 'PUT');

    // do the request, with request module
    var req = request(opts, callback);
    fs.createReadStream(file).pipe(req);
}

function deleteFile(instance, path, file, token, ignoreLocalFilePath, options, callback) {
    // append file to post to request uri
    // we preserve the local file path, if any passed with the file
    // if needed, extract the base file name from the potentially passed file path
    // this will upload the file into the passed (remote) path as is and will
    // not create any remote folders
    if (ignoreLocalFilePath) {
        path += '/' + require('path').basename(file);
    } else {
        path += '/' + file;
    }

    // build the request options
    var options = getOptions(instance, path, token, options, 'DELETE');

    // do the delete request
    request(options, callback);
}

/**
 * Download the file from the given {instance}/{path} URL and save it in the {localFilePath}
 *
 * @param {String} instance The instance from which to download the file
 * @param {String} path The path of the file to download
 * @param {String} token The Bearer token to use to authenticate
 * @param {String} localFilePath The local file path where to store the file
 * @param {Object} options The options of the request
 *
 * @returns {Promise} A Promise
 * @resolve {undefined} undefined, meaning that everything went well
 * @reject {String} An error message if the process failed
 */
function downloadFile(instance, path, token, localFilePath, options) {
    return new Promise((resolve, reject) => {
        // The local target file already exists, error if there is no option to override
        if (fs.existsSync(localFilePath) && !options.overrideLocalFile) {
            reject(`The file ${localFilePath} already exists locally. Abort.`);
            return;
        }

        // build the request options
        const opts = getOptions(instance, path, token, options, 'GET');
        // We first perform a simple GET request to the file, to ensure it returns a correct 200 HTTP Status code
        // And so, we are sure the auth is good and the file exists on the remote
        request(opts, (e, r) => {
            ocapi.ensureValidToken(e, r, (err, res) => {
                // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
                if (res && res.statusCode >= 400) {
                    reject(`Download file "${path}" to "${localFilePath}" failed: ${res.statusCode} ` +
                        `(${res.statusMessage})`);
                    return;
                } else if (err) {
                    reject(`Download file "${path}" failed: ${err}`);
                    return;
                }

                // At that point, the file exists and we have access to it, let's download it!
                const writer = fs.createWriteStream(localFilePath);
                request.get(opts).pipe(writer);
                writer.on('finish', () => resolve(undefined));
            }, () => {
                downloadFile(instance, path, token, localFilePath, options)
                    .then(() => resolve(undefined))
                    .catch(err => reject(err));
            });
        })
    });
}

function unzip(instance, path, file, token, ignoreLocalFilePath, options, callback) {
    // append file to post to request uri
    // we preserve the local file path, if any passed with the file
    // if needed, extract the base file name from the potentially passed file path
    // this will upload the file into the passed (remote) path as is and will
    // not create any remote folders
    if (ignoreLocalFilePath) {
        path += '/' + require('path').basename(file);
    } else {
        path += '/' + file;
    }

    // build the request options
    var options = getOptions(instance, path, token, options, 'POST');

    // ...extend with form method UNZIP
    options['form'] = { method : 'UNZIP' };

    // do the unzip request
    request(options, callback);
}

/**
 * Copy the given path to the destination path on the intance
 *
 * @param {String} instance The instance from which to download the file
 * @param {String} path The path of the file to download
 * @param {String} token The Bearer token to use to authenticate
 * @param {String} destinationPath The path to use as destination for the copy
 * @param {String} token The Bearer token to use to authenticate
 * @param {Object} options The options of the request
 *
 * @returns {Promise} A Promise
 * @resolve {undefined} undefined, meaning that everything went well
 * @reject {String} An error message if the process failed
 */
function copy(instance, path, destinationPath, token, options) {
    return new Promise((resolve, reject) => {
        // build the request options
        const opts = getOptions(instance, path, token, options, 'POST');
        // ...extend with form method COPY
        opts.form = {
            method: 'COPY'
        };
        // ... extend with Destination header
        opts.headers = {
            Destination: require('path').join(WEBDAV_BASE, destinationPath)
        };

        // do the unzip request
        request(opts, (e, r) => {
            ocapi.ensureValidToken(e, r, (err, res) => {
                // 201 HTTP status code means everything went well
                if (res && res.statusCode >= 201) {
                    resolve(undefined);
                    return;
                } else if (err) {
                    reject(`Download file "${path}" failed: ${err}`);
                    return;
                }

                reject(`Copying the folder "${path}" to "${destinationPath}" failed: ${res.statusCode} ` +
                    `(${res.statusMessage})`);
                return;
            }, () => {
                copy(instance, path, destinationPath, token, options)
                    .then(() => resolve(undefined))
                    .catch(err => reject(err));
            });
        });
    });
}

function upload(instance, path, file, ignoreLocalFilePath, options) {
    // check if file exists locally (use the file as passed, incl. any local file path)
    if (!fs.existsSync(file)) {
        console.error('File "%s" does not exist', file);
        return;
    } else {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
            console.error('File "%s" does not exist or is not a file', file);
            return;
        }
    }

    // initiate the request
    postFile(instance, path, file, auth.getToken(), ignoreLocalFilePath, options, function (err, res, body) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
            if (res && res.statusCode >= 400) {
                console.error('Upload file %s to %s failed: %s (%s)', file, path, res.statusCode,
                    res.statusMessage);
                return;
            } else if (err) {
                console.error('Upload file %s failed: %s', file, err);
                return;
            }
            console.info('Instance import file %s uploaded to %s', file, instance);
        }, function() {
            upload(instance, path, file, ignoreLocalFilePath, options);
        });
    });
}

function uploadInstanceImport(instance, archive, options) {
    // append file extension .zip if only archive name is given without an extension
    var file = ( archive.indexOf('.zip') !== -1 ? archive : archive + '.zip' );

    // run the upload
    upload(instance, WEBDAV_INSTANCE_IMPEX, file, true, options);
}

module.exports.uploadInstanceImport = uploadInstanceImport;
module.exports.postFile = postFile;
module.exports.deleteFile = deleteFile;
module.exports.downloadFile = downloadFile;
module.exports.copy = copy;
module.exports.unzip = unzip;
module.exports.WEBDAV_CODE = WEBDAV_CODE;
module.exports.WEBDAV_INSTANCE_IMPEX = WEBDAV_INSTANCE_IMPEX;
module.exports.api = {
    /**
     * Uploads an arbitrary file onto a Commerce Cloud instance.
     *
     * @param {String} instance The instance to upload the file to
     * @param {String} path The path relative to .../webdav/Sites where the file to upload to
     * @param {String} file The file to upload
     * @param {String} token The Oauth token to use for authentication
     * @param {Object} options The options parameter can contains two properties: pfx: the path to the client certificate to use for two factor authentication. passphrase: the optional passphrase to use with the client certificate
     * @param {Function} callback Callback function executed as a result. The error will be passed as parameter to the callback function.
     */
    upload : function (instance, path, file, token, options, callback) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance missing or not of type String');
        }
        if (typeof(path) !== 'string') {
            throw new TypeError('Parameter path missing or not of type String');
        }
        if (typeof(file) !== 'string') {
            throw new TypeError('Parameter file missing or not of type String');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token missing or not of type String');
        }
        if (typeof(options) !== 'object') {
            options = {};
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback missing or not of type Function');
        }

        // check if file exists locally
        if (!fs.existsSync(file)) {
            callback(new Error('File does not exist'));
            return;
        } else {
            var stat = fs.statSync(file);
            if (!stat.isFile()) {
                callback(new Error('File does not exist or is not a file'))
                return;
            }
        }

        // initiate the request
        postFile(instance, path, file, token, true, options, function (err, res, body) {
            if (res && res.statusCode >= 400) {
                // in case of >=400 error, callback with response status message
                callback(new Error(res.statusMessage));
                return;
            } else if (err) {
                // in case of other errors, callback with err
                callback(new Error(err));
                return;
            }
            // if successful just callback
            callback(undefined);
        });
    }
}
module.exports.cli = {
    upload : upload
};
