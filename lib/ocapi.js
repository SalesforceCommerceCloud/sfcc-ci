var auth = require('./auth');
var dwjson = require('./dwjson').init();
var console = require('./log');

const DEFAULT_OCAPI_VERSION = 'v18_1';

function getOcapiVersion(ocapiVersion) {
    return ( ocapiVersion ? ocapiVersion : DEFAULT_OCAPI_VERSION );
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
            bearer: ( token ? token : null )
        },
        strictSSL: true,
        method: method,
        json: true
    };

    // allow self-signed certificates, if needed (only supported for configuration via dw.json)
    if ( dwjson['self-signed'] ) {
        opts['strictSSL'] = false;

        console.warn('Allow self-signed certificates. Be caucious as this may expose secure information to an ' +
            'untrusted party.');
    }
    return opts;
}

function ensureValidToken(err, res, success, repeat) {
    // token invalid
    if (res && res.body
            && ((res.body.fault && res.body.fault.type == 'InvalidAccessTokenException')
                || (res.body.error == 'invalid_token' && res.body.error_description == auth.getToken()))) {
        // no auto-renewal, just log error
        if (!auth.isRenewable()) {
            console.error('Authorization missing or invalid. Please (re-)authenticate first by' +
                ' running ´sfcc-ci auth:login´ or ´sfcc-ci client:auth´ and make sure, your client has access to ' +
                'the instance.');
        } else {
            // attempt to renew
            console.warn('Authorization invalid. Auto-renewal enabled. Running authorization...');
            // renew and callback and repeat over
            auth.renew(repeat);
        }
    } else if (res && res.body && res.body.fault && res.body.fault.type == 'InvalidAuthorizationHeaderException') {
        // invalid auth header
        console.error('Authorization missing or invalid. Please authenticate first by running ' +
            '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´.');
    } else if (res && res.statusCode === 401) {
        // authentication failed in WebDAV request
        console.error('WebDAV authentication failed. Please (re-)authenticate first by running ' +
            '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´. No token auto-renewal is performed. If the problem ' +
            'still occurs please check the WebDAV Client Permissions on the instance and ensure your client ID ' +
            'has been granted access to required WebDAV resources.');
    } else if (err && !res) {
        // any error, without a proper (JSON) response (body)
        // handle special error cases
        if (err.code === 'EPROTO') {
            console.error('Network or certificate error');
        } else if (err.message === 'wrong tag') {
            console.error('Certificate error');
        } else if (err.code === 'ENOTFOUND') {
            console.error('Cannot resolve host name. Ensure you use a proper instance host name or an alias from ' +
                'the instance configuration. Detailed error: %s', err.message);
        }
        console.error('An error occured. Try running the command again with -D,--debug flag.');
        console.debug('Error code: %s, message: %s, stack: %s', err.code, err.message, err.stack);
    } else {
        // valid token or different error, trigger callback
        success(err, res);
    }
}

module.exports.getOcapiVersion = getOcapiVersion;
module.exports.getOptions = getOptions;
module.exports.ensureValidToken = ensureValidToken;