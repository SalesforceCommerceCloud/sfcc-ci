var auth = require('./auth');

const defaultOcapiVersion = 'v17_7';

function getOcapiVersion(ocapiVersion) {
    return ( ocapiVersion ? ocapiVersion : defaultOcapiVersion );
}

function ensureValidToken(err, res, success, repeat) {
    // token invalid
    if(err && res && res.body && res.body.fault && res.body.fault.type == 'InvalidAccessTokenException') {
        // no auto-renewal, just log error
        if(!auth.getAutoRenewToken()) {
            console.error('Error: Authorization token missing or invalid. Please (re-)authenticate first.');
        }
        // attempt to renew
        else {
            console.log('Authorization token invalid. Token auto-renewal enabled. Trying to renew token...');
            // renew and callback and repeat over
            auth.renew(repeat);
        }
    }
    // some other error
    else if(err && ( !res || !res.body )) {
        console.error('Error: Something went wrong with this operation: %s', err);
    }
    // valid token
    else {
        // callback success
        success(err, res);
    }
}

module.exports.getOcapiVersion = getOcapiVersion;
module.exports.ensureValidToken = ensureValidToken;