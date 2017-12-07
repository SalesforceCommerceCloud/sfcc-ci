var fs = require('fs');
var request = require('request');

var auth = require('./auth');
var ocapi = require('./ocapi');
var progress = require('./progress');

const WEBDAV_BASE = '/on/demandware.servlet/webdav/Sites';
const WEBDAV_INSTANCE_IMPEX = '/impex/src/instance'

function getOptions(instance, path, token, method) {
    // the endpoint including the relative path on the instance's file system to upload to
    var endpoint = WEBDAV_BASE + path

    var opts = {
        baseUrl: 'https://' + instance,
        uri: endpoint,
        auth: {
            bearer: token
        },
        strictSSL: false,
        method: method
    };
    // Support for 2fa
    /*
    if (this.config.p12 && this.config.hostname.indexOf('cert') === 0) {
        opts.strictSSL = true;
        opts.pfx = fs.readFileSync(this.config.p12);
        opts.passphrase = this.config.passphrase;
        opts.honorCipherOrder = true;
        opts.securityOptions = 'SSL_OP_NO_SSLv3';
        opts.secureProtocol = 'TLSv1_1_method';
        // see http://stackoverflow.com/questions/14088787/hostname-ip-doesnt-match-certificates-altname
        // and https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback
        opts.checkServerIdentity = function () {}; 

        if (this.config['self-signed']) {
            opts.rejectUnauthorized = false;
        }
    }
    */
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

function upload(instance, path, file) {
    // check if file exists locally
    if (!fs.existsSync(file)) {
        console.error('Error: File "%s" does not exist', file);
        return;
    } else {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
            console.error('Error: File "%s" does not exist or is not a file', file);
            return;
        }
    }

    // progress
    progress.start();

    // initiate the request
    postFile(instance, path, file, auth.getToken(), function (err, res, body) {
        progress.stop();
        ocapi.ensureValidToken(err, res, function(err, res) {
            // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
            if (res.statusCode >= 400) {
                console.error('Error: Upload file %s failed: %s (%s)', file, res.statusCode, res.statusMessage);
                return;
            } else if (err) {
                console.error('Error: Upload file %s failed: %s', file, err);
                return;
            }
            console.log('Instance import file %s successfully uploaded to instance %s', file, instance);
        }, function() {
            upload(instance, path, file);
        });
    });
}

function uploadInstanceImport(instance, archive) {
    // append file extension .zip if only archive name is given without an extension
    var file = ( archive.indexOf('.zip') !== -1 ? archive : archive + '.zip' );
    // run the upload
    upload(instance, WEBDAV_INSTANCE_IMPEX, file);
}

module.exports.uploadInstanceImport = uploadInstanceImport;
module.exports.api = {
    /**
     * Uploads an arbitrary file onto a Commerce Cloud instance.
     * 
     * @param {String} instance The instance to upload the file to
     * @param {String} path The path relative to .../webdav/Sites where the file to upload to
     * @param {String} file The file to upload
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