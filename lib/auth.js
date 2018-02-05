var request = require('request');

var config = require('./config').obtain();
var dwjson = require('./dwjson').init();
var console = require('./log');

const ACCOUNT_MANAGER_HOST = 'account.demandware.com';
const ACCOUNT_MANAGER_PATH = '/dw/oauth2/access_token';

/**
 * Contructs the http request options for request at the authorization server and ensure shared request
 * headers across requests.
 *
 * @param {String} host
 * @param {String} path
 * @param {String} basicAuthUser
 * @param {String} basicAuthPassword
 * @param {String} method
 * @return {Object} the request options
 */
function getOptions(host, path, basicAuthUser, basicAuthPassword, method) {
    var opts = {
        uri: 'https://' + host + path,
        auth: {
            user: basicAuthUser,
            pass: basicAuthPassword
        },
        strictSSL: true,
        method: method,
        json: true
    };
    return opts;
}

function obtainToken(accountManagerHostOverride, basicAuthUser, basicAuthPassword, callback) {
    // the default AM host
    var accountManagerHost = ACCOUNT_MANAGER_HOST;
    // override the account manager host, if needed
    if (accountManagerHostOverride) {
        accountManagerHost = accountManagerHostOverride;
    }

    // build the request options
    var options = getOptions(accountManagerHost, ACCOUNT_MANAGER_PATH, basicAuthUser, basicAuthPassword);

    // the grant type as form data
    options['form'] = { grant_type : 'client_credentials' };

    // just do the request and pass the callback
    request.post(options, callback);
}

function auth(client, client_secret, auto_renew, accountManager) {
    // if client and secret are not passed, attempt to lookup client, secret and AM host from dw.json
    if ( !client && !client_secret && dwjson['client-id'] && dwjson['client-secret'] ) {
        console.info('Using client credentials from dw.json at %s', process.cwd());

        // override the params
        client = dwjson['client-id'];
        client_secret = dwjson['client-secret'];

        // if AM host was not passed, lookup AM host from dw.json
        if ( !accountManager && dwjson['account-manager'] ) {
            accountManager = dwjson['account-manager'];

            if ( dwjson['account-manager'] !== ACCOUNT_MANAGER_HOST ) {
                console.warn('Use alternative Account Manager %s as authorization server', dwjson['account-manager']);
            }
        }
    }

    var basicString = client + ':' + client_secret;
    var basicEncoded = new Buffer(basicString).toString('base64');

    // attempt to obtain a new token
    obtainToken(accountManager, client, client_secret, function (err, res) {
        if (!err && res.statusCode == 200) {
            // update the client/token locally
            setClient(client);
            setToken(res.body.access_token);
            setAutoRenewToken(auto_renew, ( auto_renew ? basicEncoded : null ));

            console.info('Authentication succeeded' + ( auto_renew ? ' Auto-renewal enabled.' : '' ));
        } else {
            console.error('Authentication failed: %s', err);
            process.exitCode = 1;
        }
    });
}

function renew(callback) {
    // check if allowed, we allow only if flag was provided with initial authentication
    if (!getAutoRenewToken()) {
        console.error('Authentication renewal not possible. Ensure initial authentication ' +
            'is done with --renew flag.');
        process.exitCode = 1;
        return;
    }

    var basicEncoded = getAutoRenewBase64();

    // decode basic
    var basicString = Buffer.from(basicEncoded, 'base64').toString();
    var client = basicString.split(':')[0];
    var clientSecret = basicString.split(':')[1];

    // attempt to obtain a new token using the previously stored encoded basic
    obtainToken(null, client, clientSecret, function (err, res) {
        if (!err && res.statusCode == 200) {
            // update the token locally
            setToken(res.body.access_token);
            console.info('Authentication renewal succeeded');
            if (callback) {
                callback();
            }
        } else {
            console.error('Authentication renewal failed: %s', err);
            process.exitCode = 1;
        }
    });
}

function getClient() {
    return config.get('SFCC_CLIENT_ID');
}

function setClient(client) {
    config.set('SFCC_CLIENT_ID', client);
}

function getToken() {
    return config.get('SFCC_CLIENT_TOKEN');
}

function setToken(token) {
    config.set('SFCC_CLIENT_TOKEN', token);
}

function getToken() {
    return config.get('SFCC_CLIENT_TOKEN');
}

function setAutoRenewToken(flag, base64) {
    config.set('SFCC_CLIENT_RENEW_TOKEN', flag);
    config.set('SFCC_CLIENT_RENEW_BASE', base64);
}

function getAutoRenewToken() {
    return config.get('SFCC_CLIENT_RENEW_TOKEN');
}

function getAutoRenewBase64() {
    return config.get('SFCC_CLIENT_RENEW_BASE');
}

function clear() {
    config.delete('SFCC_CLIENT_ID');
    config.delete('SFCC_CLIENT_TOKEN');
    console.info('Client configuration cleared.');
}

module.exports.auth = auth;
module.exports.renew = renew;
module.exports.getToken = getToken;
module.exports.getClient = getClient;
module.exports.getAutoRenewToken = getAutoRenewToken;
module.exports.getAutoRenewBase64 = getAutoRenewBase64;
module.exports.api = {
    /**
     * Authenticates a clients and attempts to obtain a new Oauth2 token. Note, that tokens
     * should be reused for subsequent operations. In case of a invalid token you may call
     * this method again to obtain a new token.
     *
     * @param {String} client_id The client ID
     * @param {String} client_secret The client secret
     * @param {Function} success Callback function executed as a result. The token and the error will be passed as parameters to the callback function.
     */
    auth : function (client_id, client_secret, callback) {
        // check parameters
        if (typeof(client_id) !== 'string') {
            throw new TypeError('Parameter client_id missing or not of type String');
        }
        if (typeof(client_secret) !== 'string') {
            throw new TypeError('Parameter client_secret missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback missing or not of type Function');
        }

        // attempt to obtain a new token
        obtainToken(null, client_id, client_secret, function (err, res) {
            if (!err && res.statusCode == 200) {
                // if successful, callback with token
                callback(res.body.access_token, undefined);
                return
            }
            // in case of errors, callback with err
            callback(undefined, new Error(err));
            return;
        });
    }
};
module.exports.cli = {
    /**
     * End the current sessions and clears the authentication.
     */
    logout : function() {
        clear();
    }
};