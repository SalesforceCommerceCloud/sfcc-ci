var fs = require('fs');
var request = require('request');

var auth = require('./auth');
var dwjson = require('./dwjson').init();
var ocapi = require('./ocapi');
var console = require('./log');
var progress = require('./progress');

const WEBDAV_BASE = '/on/demandware.servlet/webdav/Sites';
const WEBDAV_INSTANCE_IMPEX = '/impex/src/instance'
const WEBDAV_CODE = '/cartridges'

function getOptions(instance, path, token, method) {
    // the endpoint including the relative path on the instance's file system to upload to
    var endpoint = WEBDAV_BASE + path

    var opts = {
        baseUrl: 'https://' + instance,
        uri: endpoint,
        auth: {
            bearer: token
        },
        strictSSL: true,
        method: method
    };
    // allow self-signed certificates, if needed (only supported for configuration via dw.json)
    if ( dwjson['self-signed'] ) {
        opts['strictSSL'] = false;

        console.warn('Allow self-signed certificates. Be caucious as this may expose secure information to an ' +
            'untrusted party.');
    }
    return opts;
}

function postFile(instance, path, file, token, callback) {
    // append file to post to request uri
    path += '/' + file;

    // build the request options
    var options = getOptions(instance, path, token, 'PUT');

    // do the request, with request module
    var req = request(options, callback);
    fs.createReadStream(file).pipe(req);
}

function deleteFile(instance, path, file, token, callback) {
    // append file to post to request uri
    path += '/' + file;

    // build the request options
    var options = getOptions(instance, path, token, 'DELETE');

    // do the delete request
    request(options, callback);
}

function unzip(instance, path, file, token, callback) {
    // append file to post to request uri
    path += '/' + file;

    // build the request options
    var options = getOptions(instance, path, token, 'POST');

    // ...extend with form method UNZIP
    options['form'] = { method : 'UNZIP' };

    // do the unzip request
    request(options, callback);
}

function upload(instance, path, file, sync) {
    // check if file exists locally
    if (!fs.existsSync(file)) {
        console.error('File "%s" does not exist', file);
        process.exitCode = 1;
        return;
    } else {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
            console.error('File "%s" does not exist or is not a file', file);
            process.exitCode = 1;
            return;
        }
    }

    if (!sync) {
        // progress
        progress.start();
    }

    // initiate the request
    postFile(instance, path, file, auth.getToken(), function (err, res, body) {
        if (!sync) {
            progress.stop();
        }
        ocapi.ensureValidToken(err, res, function(err, res) {
            // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
            if (res && res.statusCode >= 400) {
                console.error('Upload file %s to %s failed: %s (%s)', file, path, res.statusCode,
                    res.statusMessage);
                process.exitCode = 1;
                return;
            } else if (err) {
                console.error('Upload file %s failed: %s', file, err);
                process.exitCode = 1;
                return;
            }
            console.log('Instance import file %s successfully uploaded to instance %s', file, instance);
        }, function() {
            upload(instance, path, file, sync);
        });
    });
}

function uploadInstanceImport(instance, archive, sync) {
    // append file extension .zip if only archive name is given without an extension
    var file = ( archive.indexOf('.zip') !== -1 ? archive : archive + '.zip' );
    // run the upload
    upload(instance, WEBDAV_INSTANCE_IMPEX, file, sync);
}

function deployCodeCLI(instance, archive, sync) {
    var file = archive;

    // check if file exists locally
    if (!fs.existsSync(file)) {
        console.error('File "%s" does not exist', file);
        process.exitCode = 1;
        return;
    } else {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
            console.error('File "%s" does not exist or is not a file', file);
            process.exitCode = 1;
            return;
        }
    }

    if (!sync) {
        // progress
        progress.start();
    }

    // initiate the post request first...
    postFile(instance, WEBDAV_CODE, file, auth.getToken(), function (err, res, body) {
        if (!sync) {
            progress.stop();
        }
        ocapi.ensureValidToken(err, res, function(err, res) {
            // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
            if (res && res.statusCode >= 400) {
                console.error('Deploy code %s failed (upload step): %s (%s)', file, res.statusCode,
                    res.statusMessage);
                process.exitCode = 1;
                return;
            } else if (err) {
                console.error('Deploy code %s failed (upload step): %s', file, err);
                process.exitCode = 1;
                return;
            }
            // ...and unzip the archive afterwards
            unzip(instance, WEBDAV_CODE, file, auth.getToken(), function (err, res, body) {
                // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
                if (res && res.statusCode >= 400) {
                    console.error('Deploy code %s failed (unzip step): %s (%s)', file, res.statusCode,
                        res.statusMessage);
                    process.exitCode = 1;
                    return;
                } else if (err) {
                    console.error('Deploy code %s failed (unzip step): %s', file, err);
                    process.exitCode = 1;
                    return;
                }
                console.log('Code archive %s successfully deployed to %s', file, instance);

                // If the code is successfully deployed, we need to remove the uploaded ZIP file
                deleteFile(instance, WEBDAV_CODE, file, auth.getToken(), function(err, res, body) {
                    if (err) {
                        console.error('Delete ZIP file %s after deployment failed (deleteFile step): %s',
                            file, err);
                        process.exitCode = 1;
                        return;
                    } else {
                        if (res.statusCode === 204) {
                            console.log('Code archive %s successfully deleted on %s', file, instance);
                        } else {
                            console.error('Delete ZIP file %s after deployment failed (deleteFile step): %s (%s)',
                                file, res.statusCode, res.statusMessage);
                            process.exitCode = 1;
                        }
                    }
                });
            });
        }, function() {
            deployCodeCLI(instance, archive, sync, callback);
        });
    });
}

function deployCodeAPI(instance, archive, token, callback) {
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

    var file = archive;

    // check if file exists locally
    if (!fs.existsSync(file)) {
        callback(new Error(`Error: File "${file}" does not exist`));
        return;
    } else {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
            callback(new Error(`Error: File "${file}" does not exist or is not a file`));
            return;
        }
    }

    // initiate the post request first...
    postFile(instance, WEBDAV_CODE, file, token, function (err, res, body) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
            if (res.statusCode >= 400) {
                callback(new Error(`Error: Deploy code ${file} failed (upload step): `
                    + `${res.statusCode} (${res.statusMessage})`));
                return;
            } else if (err) {
                callback(new Error('Error: Deploy code %s failed (upload step): %s', file, err));
                return;
            }
            // ...and unzip the archive afterwards
            unzip(instance, WEBDAV_CODE, file, token, function (err, res, body) {
                // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
                if (res.statusCode >= 400) {
                    callback(new Error(`Error: Deploy code ${file} failed (unzip step): `
                        + `${res.statusCode} (${res.statusMessage})`));
                    return;
                } else if (err) {
                    callback(new Error(`Error: Deploy code ${file} failed (unzip step): ${err}`));
                    return;
                }

                // If the code is successfully deployed, we need to remove the uploaded ZIP file
                deleteFile(instance, WEBDAV_CODE, file, token, function(err, res, body) {
                    if (err) {
                        callback(new Error(`Delete ZIP file ${file} after deployment `
                            + `failed (deleteFile step): ${err}`));
                        return;
                    } else {
                        if (res.statusCode === 204) {
                            callback(undefined);
                        } else {
                            callback(new Error(`Delete ZIP file ${file} after deployment failed (deleteFile step): `
                                + `${res.statusCode} (${res.statusMessage})`));
                        }
                    }

                    callback(undefined);
                });
            });
        }, function() {
            deployCodeAPI(instance, archive, token, callback);
        });
    });
}

module.exports.uploadInstanceImport = uploadInstanceImport;
module.exports.deployCode = deployCodeCLI;
module.exports.deployCodeAPI = deployCodeAPI;
module.exports.WEBDAV_INSTANCE_IMPEX = WEBDAV_INSTANCE_IMPEX;
module.exports.api = {
    /**
     * Uploads an arbitrary file onto a Commerce Cloud instance.
     *
     * @param {String} instance The instance to upload the file to
     * @param {String} path The path relative to .../webdav/Sites where the file to upload to
     * @param {String} file The file to upload
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The error will be passed as parameter to the callback function.
     */
    upload : function (instance, path, file, token, callback) {
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
        postFile(instance, path, file, token, function (err, res, body) {
            if (res.statusCode >= 400) {
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