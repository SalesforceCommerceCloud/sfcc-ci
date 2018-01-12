var util = require('util');

var jsonwebtoken = require('jsonwebtoken');
var request = require('superagent');
var open = require('open');

var config = require('./config').obtain();
var console = require('./log');
var progress = require('./progress');

const AM_BASE = 'am.exp.dx.unified.demandware.net';
const ACCOUNT_MANAGER_URL = AM_BASE + '/dw/oauth2/access_token';
const ACCOUNT_MANAGER_SSO_URL = AM_BASE + '/dwsso/oauth2/authorize?client_id=%s&redirect_uri=%s&response_type=%s';
const OAUTH_REDIRECT_PORT = 8080; // changing the port requires to update the client_id settings in AM
const OAUTH_REDIRECT_URL = 'http://localhost:' + OAUTH_REDIRECT_PORT; // changing the uri requires to update the client_id settings in AM

/**
 * Obtain an access token using with the specified grant type from the access token endpoint
 * of the AM. If grant_type is not provided or null client_credentials is being used as default
 * grant type.
 *
 * @param {String} basicEncoded
 * @param {String} grant_type
 * @param {Function} callback callback function to execute with the result of the request
 */
function obtainToken(basicEncoded, grant_type, callback) {
    // the default grant type
    var grantPayload = 'grant_type=client_credentials';
    if ( grant_type ) {
        grantPayload = grant_type;
    }
    if ( process.env.DEBUG ) {
        console.log('Doing auth request, payload: %s', grantPayload);
    }
    // just do the request with the basicEncoded and call the callback
    request
        .post('https://' + ACCOUNT_MANAGER_URL)
        .set('Authorization', 'Basic ' + basicEncoded)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(grantPayload)
        .end(callback);
}

function auth(client, client_secret, auto_renew) {
    var basicString = client + ':' + client_secret;
    var basicEncoded = new Buffer(basicString).toString('base64');

    // progress
    progress.start();

    // attempt to obtain a new token
    obtainToken(basicEncoded, null, function (err, res) {
        progress.stop();

        if (!err && res.statusCode == 200) {
            // update the client/token locally
            setClient(client);
            setToken(res.body.access_token);
            setAutoRenewToken(auto_renew, ( auto_renew ? basicEncoded : null ));

            console.log('Authentication succeeded, token obtained successfully.' +
                ( auto_renew ? ' Auto-renewal enabled.' : '' ));
        } else {
            console.error('Authentication failed: %s', err);
            process.exitCode = 1;
        }
    });
}

function renew(callback) {
    // check if allowed, we allow only if flag was provided with initial authentication
    if (!getAutoRenewToken()) {
        console.error('Token renewal not possible. Ensure initial client ' +
            'authentication is done with --renew flag.');
        process.exitCode = 1;
        return;
    }

    // progress
    progress.start();

    var basicEncoded = getAutoRenewBase64();

    // attempt to obtain a new token using the previously stored encoded basic
    obtainToken(basicEncoded, null, function (err, res) {
        progress.stop();

        if (!err && res.statusCode == 200) {
            // update the token locally
            setToken(res.body.access_token);
            console.log('Token renewal succeeded');
            if (callback) {
                callback();
            }
        } else {
            console.error('Token renewal failed: %s', err);
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

function getUser() {
    return config.get('SFCC_USER');
}

function setUser(user) {
    config.set('SFCC_USER', user);
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

function resetToken() {
    config.delete('SFCC_CLIENT_TOKEN');
}

function clear() {
    config.delete('SFCC_CLIENT_ID');
    config.delete('SFCC_CLIENT_TOKEN');
}

/**
 * Handles the authentication of a user against the account manager to obtain an access token.
 * The Oauth athorization code flow is being used.
 *
 * @param {String} client the client id to use for the authentication flow
 * @param {String} client_secret the client secret to use for the authentication flow
 */
function login(client, client_secret) {
    // determine oauth flow to use, by default it is authorization_code
    var flow = { grant : 'authorization_code', response_type : 'code', redirect_uri : OAUTH_REDIRECT_URL };

    // if client_secret is not passed, we switch to implicit flow
    if (!client_secret) {
        flow = { grant : 'implicit', response_type : 'token', redirect_uri : OAUTH_REDIRECT_URL };
    }

    if ( process.env.DEBUG ) {
        console.log('Authorize via Oauth %s grant', flow['grant']);
    }

    // open browser
    var url = 'https://' + util.format(ACCOUNT_MANAGER_SSO_URL, client, flow['redirect_uri'], flow['response_type']);
    open(url);

    // create listener for the redirect
    listen(function(request, response) {
        // parse the request url
        var parsed = require('url').parse(request.url, true);

        // for authorization_code grant we expect the access code being passed
        if ( flow['grant'] === 'authorization_code' && parsed.query['code'] ) {
            if ( process.env.DEBUG ) {
                console.log('Message received. Access code: %s', parsed.query['code']);
            }
            // prep basic auth header
            var basicEncoded = new Buffer(client + ':' + client_secret).toString('base64');
            // prep the grant payload
            var grantPayload = 'grant_type=authorization_code&code=' + parsed.query['code'] + '&redirect_uri=' +
                OAUTH_REDIRECT_URL;

            // do the auth request with the authorization_code
            obtainToken(basicEncoded, grantPayload, function (err, res) {
                if ( process.env.DEBUG ) {
                    console.log('Authentication request finished. Response received: %s', res.statusCode);
                }
                if (!err && res.statusCode == 200) {
                    // update the client/token locally
                    setClient(client);
                    setToken(res.body.access_token);
                    // auto-renew not supported with auth:login (due to auth flow)
                    setAutoRenewToken(false);

                    // extract user data from JWT id_token
                    if (res.body.id_token) {
                        user = extractUserFromIDToken(res.body.id_token);
                        setUser(user['sub']);
                    }

                    console.log('Authentication succeeded, token obtained successfully. You may close the browser.');
                    if ( process.env.DEBUG ) {
                        console.log('Token: %s', res.body.access_token);
                    }

                    response.end('Successfully authenticated. You can close this page and return to the console.');
                } else {
                    console.error('Authentication failed: %s', err);
                    response.end('Authentication failed. Close this page and re-run the authentication in the ' +
                        'console.');
                    process.exitCode = 1;
                }
                // this is needed for the listener to stop as we only allow one cycle of the flow
                process.exit();
            });
        } else if ( flow['grant'] === 'implicit' && !parsed.query['access_token'] && !parsed.query['error']) {
            // for implicit grant, without an access token or error passed
            serve('oauth2-redirect.html', response, function(err, response) {
                response.end();

                if ( err ) {
                    console.error('Authentication failed: %s', err);
                    process.exitCode = 1;
                    process.exit();
                }

                // intentionally do not end the process here, as we still expect a redirect request with the
                // access_token
            });
        } else if ( flow['grant'] === 'implicit' && parsed.query['access_token'] ) {
            // for implicit grant along with an access token passed

            // update the client/token locally
            setClient(client);
            setToken(parsed.query['access_token']);
            // auto-renew not supported with auth:login (due to auth flow)
            setAutoRenewToken(false);

            console.log('Authentication succeeded, token obtained successfully. You may close the browser.');
            if ( process.env.DEBUG ) {
                console.log('Token: %s', res.body.access_token);
            }

            response.end('Successfully authenticated. You can close this page and return to the console.');
            // this is needed for the listener to stop
            process.exit();

        } else if ( flow['grant'] === 'implicit' && parsed.query['error'] ) {
            console.error('Authentication failed: %s', parsed.query['error']);
            response.end('Authentication failed%s. Close this page and re-run the authentication in the ' +
                'console.', ( qp['error_description'] ? ' (' + qp['error_description'] + ')' : '' ));
            // this is needed for the listener to stop
            process.exitCode = 1;
            process.exit();
        } else {
            console.error('Unknown message received, aborting authentication');
            if ( process.env.DEBUG ) {
                console.log('Parsed message: %s', JSON.stringify(parsed));
            }
            // this is needed for the listener to stop
            process.exitCode = 1;
            process.exit();
        }
    });
}

/**
 * Utility function to spin up an http endpoint on port OAUTH_REDIRECT_PORT which is used as redirect
 * for Oauth flow Authorization Code.
 *
 * @param {Function} callback the callback to execute, the request and response are passed as parameters
 */
function listen(callback) {
    var http = require('http');

    var server = http.createServer(function(request, response) {
        callback(request, response);
    });
    server.listen(OAUTH_REDIRECT_PORT, function() {
        if ( process.env.DEBUG ) {
            console.log('Local server for login redirect listening at http://localhost:%s', OAUTH_REDIRECT_PORT);
        }
        console.log('Waiting for user to authenticate...');
    });
}

/**
 * Utility function to serve a resource and writing it to the passed response.
 *
 * @param {String} resource path to the resource to serve
 * @param {Response} response the response to serve the resource content to
 * @param {Function} callback callback function, the error and the response are passed as parameters
 */
function serve(resource, response, callback) {
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
 * Utility function to extract user information from the passed JWT id_token.
 *
 * @param {String} idToken the JWT id_token
 * @return {Object} an object holding properties describing the user, or null
 */
function extractUserFromIDToken(idToken) {
    var decoded = jsonwebtoken.decode(idToken);
    if ( process.env.DEBUG ) {
        console.log('Decoded JWT id token: ', JSON.stringify(decoded));
    }
    return decoded;
}

module.exports.auth = auth;
module.exports.renew = renew;
module.exports.getToken = getToken;
module.exports.getClient = getClient;
module.exports.getUser = getUser;
module.exports.getAutoRenewToken = getAutoRenewToken;
module.exports.getAutoRenewBase64 = getAutoRenewBase64;
module.exports.clear = clear;
module.exports.resetToken = resetToken;
module.exports.login = login;
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

        var basicString = client_id + ':' + client_secret;
        var basicEncoded = new Buffer(basicString).toString('base64');

        // attempt to obtain a new token
        obtainToken(basicEncoded, null, function (err, res) {
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