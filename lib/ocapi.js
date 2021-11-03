/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var auth = require('./auth');
var dwjson = require('./dwjson').init();
var console = require('./log');
const request = require('request');

const DEFAULT_OCAPI_VERSION = 'v19_5';

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
        // new call style means we won't have a token set here, that comes in
        // retryableCall()
        auth: {bearer: (token ? token : null)},
        strictSSL: true,
        json: true
    };
    if (arguments.length === 2) { // new-style, method + URL
        opts.uri = 'https://' + arguments[1];
        opts.method = arguments[0];
    } else {
        opts.uri = 'https://' + host + path;
        opts.method = method;
    }

    // allow self-signed certificates, if needed
    if ( dwjson['self-signed'] || process.env.SFCC_ALLOW_SELF_SIGNED ) {
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

/**
 * Helper to capture most-common responses due to errors which occur across resources. In case a well-known issue
 * was identified, the function returns an Error object holding detailed information about the error. A callback
 * function can be passed optionally, the error and the response are passed as parameters to the callback function.
 *
 * @param {Object} err
 * @param {Object} response
 * @param {Function} callback
 * @return {Error} the error or null
 */
function captureCommonErrors(err, response, callback) {
    var error = null;
    if (err && !response) {
        error = new Error('The operation could not be performed properly. ' + ( process.env.DEBUG ? err : '' ));
    } else if (response.statusCode === 401) {
        error = new Error('Authorization invalid. Please (re-)authenticate first by running ' +
            '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´');
    } else if (response.statusCode === 403 && response['body'] && response['body']['fault']) {
        error = new Error([ response['body'] && response['body']['fault']['message'],
            'Please review the API permissions on the instance and try again.'].join(' '));
    } else if (response.statusCode >= 400 && response['body'] && response['body']['fault'] ) {
        error = new Error(response['body']['fault']['message']);
    }
    // just return the error, in case no callback is passed
    if (!callback) {
        return error;
    }
    callback(error, response);
}

/**
 * Call `url` using the current access token. If this fails, renew the token if
 * possible and retry the request.
 *
 * @param {String} method HTTP request method to use on `url`
 * @param {String|Object} url full URL to call or a full options object (see #getOptions)
 * @param {Function} responseHandler executed with arguments `err` and `res` when we get a response with application data (might still be an application error)
 */
function retryableCall(method, url, responseHandler) {
    var options = typeof url === 'string' ? getOptions(method, url) : url;
    // make sure we always include a token if at all possible
    if (!options.hasOwnProperty('auth')) {
        options.auth = { bearer: null };
    }
    // always replace with the current token
    // vitally important when retry-ing with the previous, failed options object
    if (auth.getToken()) {
        options.auth.bearer = auth.getToken();
    }
    request(options, function(err, res, body) {
        ensureValidToken(err, res, responseHandler, function() {
            retryableCall(method, options, responseHandler);
        });
    });
}

module.exports.getOcapiVersion = getOcapiVersion;
module.exports.getOptions = getOptions;
module.exports.ensureValidToken = ensureValidToken;
module.exports.retryableCall = retryableCall;
module.exports.captureCommonErrors = captureCommonErrors;