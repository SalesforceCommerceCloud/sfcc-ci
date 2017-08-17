var auth = require('./auth');

const defaultOcapiVersion = 'v17_6';

function getOcapiVersion(ocapiVersion) {
    return ( ocapiVersion ? ocapiVersion : defaultOcapiVersion );
}

function ensureValidToken(err, res, callback) {
    if(err && res && res.body && res.body.fault && res.body.fault.type == 'InvalidAccessTokenException') {
        console.error('Error: Authorization token missing or invalid. Please (re-)authenticate first.');
        if(auth.getAutoRenewToken()) {
            console.log('Token auto-renewal enabled. Trying to renew token.');
            auth.auth(auth, client_secret, auto_renew);
        }
    } else if(err && ( !res || !res.body )) {
        console.error('Error: Something went wrong with this operation: %s', err);
    } else {
        callback(err, res);
    }
}

module.exports.getOcapiVersion = getOcapiVersion;
module.exports.ensureValidToken = ensureValidToken;