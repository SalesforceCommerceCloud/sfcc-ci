/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var util = require('util');

var jsonwebtoken = require('jsonwebtoken');
var opn = require('open');
var request = require('request');

var config = require('./config').obtain();
var dwjson = require('./dwjson').init();
var secrets = require('./secrets');
var console = require('./log');

const ACCOUNT_MANAGER_HOST = 'account.demandware.com';
const ACCOUNT_MANAGER_TOKEN_PATH = '/dw/oauth2/access_token';
const ACCOUNT_MANAGER_AUTH_PATH = '/dwsso/oauth2/authorize?client_id=%s&redirect_uri=%s&response_type=%s';
const OAUTH_LOCAL_PORT_DEFAULT = 8080;
const OAUTH_LOCAL_PORT = getOauthPort(); // overwriting the port requires to update the client_id settings in AM, can be overwritten with env var SFCC_OAUTH_LOCAL_PORT
const OAUTH_REDIRECT_URL = 'http://localhost:' + OAUTH_LOCAL_PORT; // changing the uri requires to update the client_id settings in AM
// SECURITY NOTE: allowing this, requires to expose the client secret to the CLI as part of the auth flow
const OAUTH_AUTHORIZATION_CODE_GRANT_ALLOWED = false;

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

/**
 * Utility function to lookup the auth server host name. By default it is the host name
 * defined as ACCOUNT_MANAGER_HOST. The default host can be overwritten using the environment
 * variable SFCC_LOGIN_URL.
 *
 * @return {String} the auth server host name
 */
function getAMHost() {
    // check on env var and return it if set
    if ( process.env.SFCC_LOGIN_URL ) {
        console.debug('Using alternative login url %s defined in env var `SFCC_LOGIN_URL`',
            process.env.SFCC_LOGIN_URL);
        return process.env.SFCC_LOGIN_URL;
    }
    // return the default auth server host otherwise
    return ACCOUNT_MANAGER_HOST;
}

/**
 * Utility function to lookup the oauth local port. By default it is the port as defined in
 * defined as OAUTH_LOCAL_PORT_DEFAULT. The default port can be overwritten using the environment
 * variable SFCC_OAUTH_LOCAL_PORT.
 *
 * @return {Number} the oauth local port
 */
function getOauthPort() {
    // check on env var and return it if set
    if ( process.env.SFCC_OAUTH_LOCAL_PORT ) {
        console.debug('Using alternative Oauth local port %s defined in env var `SFCC_OAUTH_LOCAL_PORT`',
            process.env.SFCC_OAUTH_LOCAL_PORT);
        return process.env.SFCC_OAUTH_LOCAL_PORT;
    }
    // return the default auth server host otherwise
    return OAUTH_LOCAL_PORT_DEFAULT;
}

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
        strictSSL: true,
        method: method,
        json: true
    };
    // append basic auth, if either user or password are passed
    if ( basicAuthUser || basicAuthPassword ) {
        // apply URI component encoding to secret
        opts['auth'] = {
            user: basicAuthUser,
            pass: encodeURIComponent(basicAuthPassword)
        };
    }
    return opts;
}

/**
 * Obtain an access token using with the specified grant type from the access token endpoint
 * of the AM. If grantType is not provided or null grant_type=client_credentials is being used as default
 * grant payload.
 *
 * @param {String} accountManagerHostOverride Alternative host of the Account Manager to use, fallback to default
 * @param {String} basicAuthUser User name used for basic auth
 * @param {String} basicAuthPassword Password used for basic auth
 * @param {Object} grantPayload the grant payload to sent, by default { grant_type : 'client_credentials' } is used
 * @param {Function} callback callback function to execute with the result of the request
 */
function obtainToken(accountManagerHostOverride, basicAuthUser, basicAuthPassword, grantPayload, callback) {
    // the default AM host
    var accountManagerHost = getAMHost();
    // override the account manager host, if needed
    if (accountManagerHostOverride) {
        accountManagerHost = accountManagerHostOverride;
    }

    // allow basic auth only, if both user and password are passed
    if ( !basicAuthUser || !basicAuthPassword ) {
        basicAuthUser = undefined;
        basicAuthPassword = undefined;
    }

    // the payload with the default grant type
    var payload = { grant_type : 'client_credentials' };
    if ( grantPayload ) {
        payload = grantPayload;
    }

    console.debug('Doing auth request, payload: %s', JSON.stringify(payload));

    // build the request options
    var options = getOptions(accountManagerHost, ACCOUNT_MANAGER_TOKEN_PATH, basicAuthUser, basicAuthPassword);

    // the grant type as form data
    options['form'] = payload;

    // just do the request and pass the callback
    request.post(options, callback);
}

/**
 * Handles the authentication of a client along with an optional user against the account manager to
 * obtain an access token. The Oauth2 resource owner password credentials grant is being used by default.
 * None of the parameters are required. If client and client secret are passed and user is
 * not passed, the Oauth2 client credentials grant is used. If client, client secret and user is passed,
 * the Oauth2 resource owner password credentials grant is used.
 *
 * If client and client secret are not passed an attempt is done to read client-id and client-secret from
 * a dw.json file in the current process working directory and the Oauth2 client credentials grant is used.
 *
 * TODO make client(?) and clientSecret optional and use private key instead
 *
 * @param {String} client The client to use with the authentication flow
 * @param {String} clientSecret The client secret to use with the authentication flow
 * @param {String} user The user to use with the authentication flow
 * @param {String} userPassword The user password to use with the authentication flow
 * @param {Boolean} autoRenew A flag controlling, wether the access token should be renewed automatically, false by default
 * @param {String} accountManager The optional host name of the Account Manager to use as authorization server
 */
function auth(client, clientSecret, user, userPassword, autoRenew, accountManager) {
    // determine oauth flow to use, by default it is resource owner password credentials
    var flow = { grant : 'password', response_type : 'code' };

    // if client and secret are not passed, attempt to look them up from alternative sources, honoring dw.json and env vars
    if ( !client && !clientSecret ) {
        try {
            client = secrets.getClientID(null);
            clientSecret = secrets.getClientSecret(null);
        } catch (e) {
            console.error(`Authentication failed: ${e.message}`);
            return;
        }
    }

    // if username and password are not passed, attempt to look them up from alternative sources, honoring dw.json and env vars
    if ( !user && !userPassword ) {
        try {
            user = secrets.getUsername(null);
            userPassword = secrets.getPassword(null);
        } catch (e) {
            // in case lookup fails and user credentails are not present, we still want to support client_credentials grant
        }
    }

    // if user is unknown, we switch to client_credentials
    if (!user) {
        flow = { grant : 'client_credentials', response_type : 'token' };
    }

    console.debug('Authorize via Oauth %s grant', flow['grant']);

    // default AM host (the production AM)
    var accountManagerHost = getAMHost();
    // alternative AM host
    if ( accountManager && accountManager !== ACCOUNT_MANAGER_HOST ) {
        accountManagerHost = accountManager;
        console.warn('Use alternative Account Manager %s as authorization server', accountManager);
    }

    // if AM host is not passed, attempt to look it up from dw.json
    if ( !accountManager && dwjson['account-manager'] ) {
        accountManagerHost = dwjson['account-manager'];

        if ( dwjson['account-manager'] !== ACCOUNT_MANAGER_HOST ) {
            console.warn('Use alternative Account Manager %s as authorization server', dwjson['account-manager']);
        }
    }

    // the grant payload to use
    var grantPayload = { grant_type : flow['grant'] };

    // in case we use resource owner password credentials we append the user name and password
    if ( flow['grant'] === 'password' ) {
        grantPayload['username'] = user;
        grantPayload['password'] = userPassword;
    } else if ( flow['grant'] === 'client_credentials' ) {
        // in case we use client_credentials we use basic auth
        // TODO this may be adjusted based on the usual client auth settings in AM?
    }

    // attempt to obtain a new token
    obtainToken(accountManagerHost, client, clientSecret, grantPayload, function (err, res) {
        if (!err && res.statusCode == 200) {
            // update the client/token locally
            setClient(client);
            setAccessToken(res.body.access_token);

            // the auto renew requires to store the base64 encoded client and secret
            if (autoRenew) {
                var credentials = Buffer.from(client + ':' + clientSecret).toString('base64');
                // token might null, that's ok
                setAutoRenewToken(credentials, res.body['refresh_token']);
            } else {
                setAutoRenewToken(null, null);
            }

            // extract and persist user info from JWT id_token if issued
            if (res.body.id_token) {
                user = decodeJWT(res.body.id_token);
                setUser(user['sub']);
            } else {
                // remove previous user info otherwise
                setUser(null);
            }

            console.info('Authentication succeeded' + ( isRenewable() ? ' Auto-renewal enabled.' : '' ));
        } else if ( res && res.body && res.body['error_description']) {
            console.error('Authentication failed: %s', res.body['error_description']);
        } else {
            console.error('Authentication failed: %s', err);
        }
    });
}

/**
 * Refreshes expired access tokens as described here: https://www.oauth.com/oauth2-servers/access-tokens/refreshing-access-tokens/
 *
 * For this to work, `client:auth` or `client:login` must have been called with
 * the `--renew` flag. We don't store the necessary information otherwise.
 *
 * If the original authentication was with client id and secret only (client_credentials grant), this will result in
 * another `client_credentials` grant (similar to calling {@link #auth} directly).
 *
 * A successful token refresh will update the stored access token and may
 * update the stored refresh token.
 *
 * @param {Function} callback If provided, we'll call this function on a successful authentication refresh
 */
function renew(callback) {
    if (!isRenewable()) {
        console.error('Authentication renewal not possible. Ensure initial authentication ' +
            'is done with --renew flag.');
        return;
    }

    var basicEncoded = getAutoRenewBase64();

    // decode basic
    var basicString = Buffer.from(basicEncoded, 'base64').toString().split(':'),
        client = basicString[0],
        secret = basicString[1],
        grant = getRefreshToken() != null
            ? { grant_type: 'refresh_token', refresh_token: getRefreshToken() }
            : { grant_type: 'client_credentials', response_type: 'token' };

    // attempt to obtain a new token using the previously stored encoded basic
    obtainToken(null, client, secret, grant, function (err, res) {
        if (!err && res.statusCode == 200) {
            // update the token locally
            setAccessToken(res.body.access_token);
            console.info('Authentication renewal succeeded');
            // server might have issued a new refresh token
            if (res.body['refresh_token']) {
                setRefreshToken(res.body['refresh_token']);
            }
            if (callback) {
                callback();
            }
        } else {
            console.error('Authentication renewal failed: %s', err);
        }
    });
}

function isRenewable() {
    return getAutoRenewBase64();
}

function getClient() {
    return config.get('SFCC_CLIENT_ID');
}

function setClient(client) {
    config.set('SFCC_CLIENT_ID', client);
}

function getUser() {
    return config.get('SFCC_USER');
}

function setUser(user) {
    config.set('SFCC_USER', user);
}

function getToken() {
    return getAccessToken();
}

function getAccessToken() {
    return config.get('SFCC_CLIENT_TOKEN');
}

function setAccessToken(token) {
    config.set('SFCC_CLIENT_TOKEN', token);
}

function getRefreshToken() {
    return config.get('SFCC_REFRESH_TOKEN');
}

function setRefreshToken(token) {
    if (token == null) {
        config.delete('SFCC_REFRESH_TOKEN');
    } else {
        config.set('SFCC_REFRESH_TOKEN', token);
    }
}

function setAutoRenewToken(credentials, refresh_token) {
    setRefreshToken(refresh_token);
    config.set('SFCC_CLIENT_RENEW_BASE', credentials);
}

function getAutoRenewBase64() {
    return config.get('SFCC_CLIENT_RENEW_BASE');
}

function clear() {
    config.delete('SFCC_CLIENT_ID');
    config.delete('SFCC_CLIENT_TOKEN');
    console.info('Client configuration cleared.');
}

/**
 * Handles the authentication of a user against the account manager to obtain an access token.
 * The Oauth implicit grant is being used by default.
 *
 * The client and the client secret are optional. If not provided, client and optionally secret are read from a
 * dw.json file located in the current working directory. If not existing in dw.json file, client is read
 * from env var SFCC_OAUTH_CLIENT_ID.
 *
 * SECURITY NOTE: Using Oauth authorization code grant requires the CLI to have general support for this flow
 * which is controlled by OAUTH_AUTHORIZATION_CODE_GRANT_ALLOWED. It also requires the client secret which the
 * user may not want share.
 *
 * @param {String} client the client id to use for the authentication flow, optional
 * @param {String} clientSecret the client secret to use for the authentication flow, optional
 * @param {String} authServer an alternative authorization server host name, if different from default auth server
 */
function login(client, clientSecret, authServer) {
    // lookup client, honoring explicitly passed parameter, dw.json and env var as alternative
    try {
        client = secrets.getClientID(client);
    } catch (e) {
        console.error(`Authentication failed: ${e.message}`);
        return;
    }

    if (!clientSecret && dwjson['client-secret']) {
        clientSecret = dwjson['client-secret'];
        console.info('Using client secret from dw.json at %s', process.cwd());
    }

    clientSecret = clientSecret || dwjson['client-secret'];
    // determine oauth flow to use, by default it is implicit
    var flow = { grant : 'implicit', response_type : 'token', redirect_uri : OAUTH_REDIRECT_URL };

    // if generally support and clientSecret is passed, we switch to authorization_code
    if ( OAUTH_AUTHORIZATION_CODE_GRANT_ALLOWED && clientSecret) {
        flow = { grant : 'authorization_code', response_type : 'code', redirect_uri : OAUTH_REDIRECT_URL };
        console.warn('Using Oauth autorization code grant');
    }

    // TODO rework auto-renew (should be ignored in some cases? rather with refresh_token?)

    console.debug('Authorize via Oauth %s grant', flow['grant']);

    // the auth server host (use production AM by default)
    var accountManagerHost = getAMHost();
    // alternative AM host
    if ( authServer && authServer !== ACCOUNT_MANAGER_HOST ) {
        accountManagerHost = authServer;
        console.warn('Use alternative Account Manager %s as authorization server', authServer);
    }

    // the url to open
    var url = 'https://' + util.format(accountManagerHost + ACCOUNT_MANAGER_AUTH_PATH, client, flow['redirect_uri'],
        flow['response_type']);

    // print url to console (in case machine has no default user agent)
    console.info('Login url: %s', url);
    console.info('If the url does not open automatically, copy/paste the login url into a browser on this machine.');

    // attempt to open the machines default user agent
    opn(url);

    // create listener for the redirect
    listen(function(request, response) {
        // parse the request url
        var parsed = require('url').parse(request.url, true);

        // for authorization_code grant we expect the access code being passed
        if ( flow['grant'] === 'authorization_code' && parsed.query['code'] ) {
            console.debug('Message received. Access code: %s', parsed.query['code']);

            // prep the grant payload
            var grantPayload = { grant_type : 'authorization_code', code : parsed.query['code'],
                redirect_uri : OAUTH_REDIRECT_URL };

            // do the auth request with the authorization_code
            obtainToken(accountManagerHost, client, clientSecret, grantPayload, function (err, res) {
                console.debug('Authentication request finished. Response received: %s', res.statusCode);

                if (!err && res.statusCode == 200) {
                    // update the client/token locally
                    setClient(client);
                    setAccessToken(res.body.access_token);
                    // auto-renew not supported with auth:login (due to auth flow)
                    setAutoRenewToken(false, null);

                    // persist refresh_token if issued
                    if (res.body['refresh_token']) {
                        setRefreshToken(res.body['refresh_token']);
                    } else {
                        // remove a previous refresh_token otherwise
                        setRefreshToken(null);
                    }

                    // extract and persist user info from JWT id_token
                    if (res.body.id_token) {
                        user = decodeJWT(res.body.id_token);
                        setUser(user['sub']);
                    } else {
                        // remove previous user info otherwise
                        setUser(null);
                    }

                    console.info('Authentication succeeded. You may close the browser.');
                    console.debug(res.body);

                    response.end('Successfully authenticated. You can close this page and return to the console.');
                } else {
                    console.error('Authentication failed: %s', err);
                    response.end('Authentication failed. Close this page and re-run the authentication in the ' +
                        'console.');
                }
                // this is needed for the listener to stop as we only allow one cycle of the flow
                process.exit();
            });
        } else if ( flow['grant'] === 'implicit' && !parsed.query['access_token'] && !parsed.query['error']) {
            // for implicit grant, without an access token or error passed
            serve(null, getOauth2RedirectHTML(), response, function(err, response) {
                response.end();

                if ( err ) {
                    console.error('Authentication failed: %s', err);
                    process.exit();
                }

                // intentionally do not end the process here, as we still expect a redirect request with the
                // access_token
            });
        } else if ( flow['grant'] === 'implicit' && parsed.query['access_token'] ) {
            // for implicit grant along with an access token passed

            // update the client/token locally
            setClient(client);
            setAccessToken(parsed.query['access_token']);
            // auto-renew not supported with implicit flow
            setAutoRenewToken(false, null);

            // remove a previous refresh_token (refresh_token never issued with implicit flow)
            setRefreshToken(null);

            // extract user data from JWT id_token
            if (parsed.query['id_token']) {
                user = decodeJWT(parsed.query['id_token']);
                setUser(user['sub']);
            } else {
                setUser(null);
            }

            console.info('Authentication succeeded. You may close the browser.');
            console.debug(parsed.query);

            response.end('Successfully authenticated. You can close this page and return to the console.');
            // this is needed for the listener to stop
            process.exit();
        } else if ( flow['grant'] === 'implicit' && parsed.query['error'] ) {
            // for implicit grant, with an error passed
            console.error('Authentication failed: %s', parsed.query['error']);
            response.end('Authentication failed. ' +
                ( parsed.query['error_description'] ? parsed.query['error_description'] + ' ' : '' ) +
                'Close this page and re-run the authentication in the console.');
            // this is needed for the listener to stop
            process.exit();
        } else {
            console.error('Unknown message received, aborting authentication');
            console.debug('Parsed message: %s', JSON.stringify(parsed));

            // this is needed for the listener to stop
            process.exit();
        }
    });
}

/**
 * Utility function to spin up an local http endpoint which is used as redirect for Oauth flow Authorization
 * Code and Implicit.
 *
 * @param {Function} callback the callback to execute, the request and response are passed as parameters
 */
function listen(callback) {
    var http = require('http');

    var server = http.createServer(function(request, response) {
        callback(request, response);
    });
    server.listen(OAUTH_LOCAL_PORT, function() {
        console.debug('Local server for login redirect listening at http://localhost:%s', OAUTH_LOCAL_PORT);
        console.info('Waiting for user to authenticate...');
    });
}

/**
 * Utility function to serve a resource and writing it to the passed response.
 *
 * @param {String} resource path to the resource to serve
 * @param {String} source the source code to serve, optional
 * @param {Response} response the response to serve the resource content to
 * @param {Function} callback callback function, the error and the response are passed as parameters
 */
function serve(resource, source, response, callback) {
    // serve the source
    if (source) {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.write(source);
        callback(undefined, response);
        return;
    }

    // otherwise serve the static resource from file
    var fs = require('fs');
    var path = require('path');

    // construct the absolute path to the resource
    var resourcePath = path.join(__dirname, '..', 'resources', resource);

    fs.readFile(resourcePath, function (error, resourceContent) {
        if (error) {
            response.writeHead(404);
            response.write('Resource not found');
        } else {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.write(resourceContent);
        }
        callback(error, response);
    });
}

/**
 * Utility function decode the passed JWT.
 *
 * @param {String} jwt the JWT
 * @return {Object} an object holding properties of the JWT
 */
function decodeJWT(jwt) {
    var decoded = jsonwebtoken.decode(jwt);
    if (decoded) {
        console.debug('Decoded JWT token: ', JSON.stringify(decoded));
        return decoded;
    }
    throw new Error('Could not decode JWT. Possibly the token format is not set to JWT.');
}

/**
 * Determines details of the currently authenticated user.
 *
 * @return {Promise}
 */
async function getAuthenticatedUser() {
    // build the request options
    var options = {
        uri: 'https://' + getAMHost() + '/dw/rest/v1/users/current',
        auth: {
            bearer: getToken()
        },
        strictSSL: false,
        method: 'GET',
        json: true
    }

    // do request
    return new Promise(function(resolve, reject) {
        request(options, function (err, res, body) {
            if ( err ) {
                reject(new Error(`Lookup of authenticated user failed: ${err}`));
                return;
            } else if ( res.statusCode >= 400 ) {
                reject(new Error(`Lookup of authenticated user failed: ${res.statusCode}`));
                return;
            }
            resolve(body);
        });
    });
}

/**
 * Determines details of the currently authenticated client.
 *
 * @return {Promise}
 */
async function getAuthenticatedClient() {
    return new Promise(function(resolve, reject) {
        var extracted;
        try {
            extracted = decodeJWT( getToken() );
        } catch (e) {
            reject(new Error('Not authenticated. Please authenticate first.'));
            return;
        }
        // ensure an API client credentials was authenticated
        // and if it's the proper grant type
        if ( !extracted.grant_type == 'client_credentials' ) {
            reject(new Error('Not properly authenticated. Please authenticate using a supported auth flow.'));
            return;
        }

        // finally obtain authenticated client details
        request({
            uri: 'https://' + getAMHost() + '/dw/rest/v1/apiclients/' + extracted.sub,
            auth: {
                bearer: getToken()
            },
            strictSSL: false,
            method: 'GET',
            json: true
        }, function (err, res, body) {
            if ( err ) {
                reject(new Error(`Lookup of authenticated client failed: ${err}`));
                return;
            } else if ( res.statusCode >= 400 ) {
                reject(new Error(`Lookup of authenticated client failed: ${res.statusCode}`));
                return;
            }
            resolve(body);
        });
    });
}

/**
 * Determines the organization id of either the authenticated user or the authenticated
 * client.
 *
 * @return String
 */
async function getOrgOfAuthenticatedSubject() {
    try {
        var user = await getAuthenticatedUser();
        return user.primaryOrganization;
    } catch (e) {}
    try {
        var client = await getAuthenticatedClient();
        if ( client.organizations && client.organizations.length == 1 ) {
            return client.organizations[0];
        }
    } catch (e) {}

    throw new Error(`Organization cannot be determined`);
}

/**
 * Returns the html source for the local Oauth2 redirect page
 */
function getOauth2RedirectHTML() {
    return `
        <!doctype html>
        <html lang="en">
        <body onload="process()">
        </body>
        </html>
        <script>
            \'use strict\';
            function process () {
                var sentState = undefined;
                var redirectUrl = [ window.location.protocol, \'//\', window.location.host, 
                    window.location.pathname ].join(\'\');

                // the query params transported in the hash
                var qp = window.location.hash.substring(1);
                var arr = qp.split("&");

                arr.forEach(function (v,i,_arr) { _arr[i] = \'"\' + v.replace(\'=\', \'":"\') + \'"\';});
                qp = qp ? JSON.parse(\'{\' + arr.join() + \'}\',
                        function (key, value) {
                            return key === "" ? value : decodeURIComponent(value)
                        }
                ) : {};

                var valid = ( qp[\'error\'] ? false : true );

                if ( valid ) {
                    redirectUrl += \'?access_token=\' + encodeURIComponent(qp[\'access_token\']);
                    if (qp[\'id_token\']) {
                        redirectUrl += \'&id_token=\' + encodeURIComponent(qp[\'id_token\']);
                    }
                } else {
                    redirectUrl += \'?error=\' + encodeURIComponent(qp[\'error\']) +
                        ( qp[\'error_description\'] ? \'&error_description=\' + 
                            encodeURIComponent(qp[\'error_description\']) : \'\' );
                }

                location.href = redirectUrl;
            }
        </script>
    `;
}

module.exports.auth = auth;
module.exports.renew = renew;
module.exports.getAMHost = getAMHost;
module.exports.getToken = getToken;
module.exports.getAccessToken = getAccessToken;
module.exports.getRefreshToken = getRefreshToken;
module.exports.getClient = getClient;
module.exports.getUser = getUser;
module.exports.getOrgOfAuthenticatedSubject = getOrgOfAuthenticatedSubject;
module.exports.getAuthenticatedUser = getAuthenticatedUser;
module.exports.getAuthenticatedClient = getAuthenticatedClient;
module.exports.isRenewable = isRenewable;
module.exports.getAutoRenewBase64 = getAutoRenewBase64;
module.exports.OAUTH_AUTHORIZATION_CODE_GRANT_ALLOWED = OAUTH_AUTHORIZATION_CODE_GRANT_ALLOWED;
module.exports.clear = clear;
module.exports.login = login;
module.exports.api = {
    /**
     * Authenticates a clients and attempts to obtain a new Oauth2 token. Note, that tokens
     * should be reused for subsequent operations. In case of a invalid token you may call
     * this method again to obtain a new token.
     *
     * @param {String} client_id The client ID
     * @param {String} client_secret The client secret
     * @param {Function} callback Callback function executed as a result. The error and the token are passed as parameters to the callback function.
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
        obtainToken(null, client_id, client_secret, null, function (err, res) {
            if (!err && res.statusCode == 200) {
                // if successful, callback with token
                callback(undefined, res.body.access_token);
                return
            }
            // in case of errors, callback with err
            callback(new Error(err), undefined);
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
