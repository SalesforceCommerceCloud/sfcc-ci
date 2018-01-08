var auth = require('./auth');
var console = require('./log');

const DEFAULT_OCAPI_VERSION = 'v18_1';

function getOcapiVersion(ocapiVersion) {
    return ( ocapiVersion ? ocapiVersion : DEFAULT_OCAPI_VERSION );
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
    } else if (res.statusCode === 401) {
        // authentication failed in WebDAV request
        console.error('WebDAV authentication failed. Please (re-)authenticate first by running ' +
                '´sfcc-ci client:auth:renew´. No token auto-renewal is performed. If the problem still occurs please' +
                ' check the WebDAV Client Permissions on the instance and ensure your client ID has been granted ' +
                'access to required WebDAV resources.');

    } else {
        // valid token or different error, trigger callback
        success(err, res);
    }
}

module.exports.getOcapiVersion = getOcapiVersion;
module.exports.ensureValidToken = ensureValidToken;