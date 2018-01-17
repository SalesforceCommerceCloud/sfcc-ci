var auth = require('./auth');
var dwjson = require('./dwjson').init();
var console = require('./log');

const DEFAULT_OCAPI_VERSION = 'v18_1';

function getOcapiVersion(ocapiVersion) {
    return ( ocapiVersion ? ocapiVersion : DEFAULT_OCAPI_VERSION );
}

// TODO remove in favor for reading configuration from within getOptions and apply per request
function prepareRequest() {
    if ( dwjson['self-signed'] ) {
        // @todo replace superagent with npm request module to allow removal of this hack
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

        console.warn('Allow self-signed certificates. Be caucious as this may expose secure information to an ' +
            'untrusted party.');
    }
}

/**
 * Contructs the http request options and ensure shared request headers across requests, such as authentication.
 *
 * @param {String} host
 * @param {String} path
 * @param {String} token
 * @param {String} method
 * @return {Object} the request options
 */
function getOptions(host, path, token, method) {
    var opts = {
        uri: 'https://' + host + path,
        auth: {
            bearer: token
        },
        strictSSL: false,
        method: method,
        json: true
    };
    return opts;
}

function ensureValidToken(err, res, success, repeat) {
    // token invalid
    if (err && res && res.body && res.body.fault && res.body.fault.type == 'InvalidAccessTokenException') {
        // no auto-renewal, just log error
        if (!auth.getAutoRenewToken()) {
            console.error('Authorization token missing or invalid. Please (re-)authenticate first by' +
                ' running ´sfcc-ci client:auth:renew´.');
            success(err, res);
        } else {
            // attempt to renew
            console.warn('Authorization token invalid. Token auto-renewal enabled. Trying to renew token...');
            // renew and callback and repeat over
            auth.renew(repeat);
        }
    } else if (res && res.statusCode === 401) {
        // authentication failed in WebDAV request
        console.error('WebDAV authentication failed. Please (re-)authenticate first by running ' +
                '´sfcc-ci client:auth:renew´. No token auto-renewal is performed. If the problem still occurs please' +
                ' check the WebDAV Client Permissions on the instance and ensure your client ID has been granted ' +
                'access to required WebDAV resources.');
        process.exitCode = 1;
    } else if (err && !res) {
        // any error, without a proper (JSON) response (body)
        console.error('%s', err);
        process.exitCode = 1;
    } else {
        // valid token or different error, trigger callback
        success(err, res);
    }
}

// prepare any request with common configuration
prepareRequest();

module.exports.getOcapiVersion = getOcapiVersion;
module.exports.getOptions = getOptions;
module.exports.ensureValidToken = ensureValidToken;