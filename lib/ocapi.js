var auth = require('./auth');

const DEFAULT_OCAPI_VERSION = 'v17_7';

function getOcapiVersion(ocapiVersion) {
    return ( ocapiVersion ? ocapiVersion : DEFAULT_OCAPI_VERSION );
}

function ensureValidToken(err, res, success, repeat) {
    // token invalid
    if (err && res && res.body && res.body.fault && res.body.fault.type == 'InvalidAccessTokenException') {
        // no auto-renewal, just log error
        if (!auth.getAutoRenewToken()) {
            console.error('Error: Authorization token missing or invalid. Please (re-)authenticate first.');
        } else {
            // attempt to renew
            console.log('Authorization token invalid. Token auto-renewal enabled. Trying to renew token...');
            // renew and callback and repeat over
            auth.renew(repeat);
        }
    } else if (err && ( !res || !res.body )) {
        // some other error
        console.error('Error: Something went wrong with this operation: %s', err);
    } else {
        // valid token, callback success
        success(err, res);
    }
}

module.exports.getOcapiVersion = getOcapiVersion;
module.exports.ensureValidToken = ensureValidToken;