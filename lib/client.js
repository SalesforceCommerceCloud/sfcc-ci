var request = require('request');

var auth = require('./auth');
var console = require('./log');

const API_BASE = '/dw/rest/v1';

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
    } else if (response['body'] && response['body']['errors'] && response['body']['errors'][0] &&
    response['body']['errors'][0]['code'] === 'AccessDeniedException') {
        error = new Error('Unsufficient privileges');
    } else if (response.statusCode === 401) {
        error = new Error('Authentication invalid. Please (re-)authenticate by running ' +
            '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´');
    } else if (response['body'] && response['body']['fault'] &&
        response['body']['fault']['type'] === 'ClientAccessForbiddenException') {
        error = new Error('Insufficient permissions. Ensure your API key has permissions ' +
            'to perform this operation on the instance.');
    } else if (response.statusCode >= 400 && response['body'] && response['body']['fault']) {
        error = new Error(response['body']['fault']['message']);
    }
    // just return the error, in case no callback is passed
    if (!callback) {
        return error;
    }
    callback(error, response);
}

/**
 * Contructs the http request options and ensure shared request headers across requests, such as authentication.
 *
 * @param {String} path
 * @param {String} token
 * @param {String} method
 * @return {Object} the request options
 */
function getOptions(path, token, method) {
    var opts = {
        uri: 'https://' + auth.getAMHost() + path,
        auth: {
            bearer: ( token ? token : null )
        },
        strictSSL: false,
        method: method,
        json: true
    };
    return opts;
}

/**
 * Retrieves details of an Oauth client
 *
 * @param {String} id the id of the Oauth client
 * @param {Function} callback the callback to execute, the error and the Oauth client are available as arguments to the callback function
 */
function getClient(id, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/apiclients/' + id, auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if ( res.statusCode === 404 ) {
            callback(new Error(`Oauth client not found`));
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(`Getting Oauth client failed: ${res.statusCode}`));
            return;
        } else if ( err ) {
            callback(new Error(`Getting Oauth client failed: ${err}`));
            return;
        }

        // do the callback with the body
        callback(undefined, body);
    });
}

/**
 * Updates an existing Oauth client.
 *
 * @param {Object} client the Oauth client to update
 * @param {Object} changes the changes to make to the Oauth client
 * @param {Function} callback the callback to execute, the error and the updated Oauth client are available as arguments to the callback function
 */
function updateClient(client, changes, callback) {
    if (changes['password']) {
        callback(new Error(`Updating Oauth client failed. Changing password is not supported.`));
        return;
    }

    // build the request options
    var options = getOptions(API_BASE + '/apiclients/' + client['id'], auth.getToken(), 'PUT');

    // merge changes with Oauth client
    var updatedClient = Object.assign(client, changes);

    // the payload
    options['body'] = updatedClient;

    // do the request
    request.put(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);

        console.debug(body);

        if ( errback ) {
            callback(errback);
            return;
        } else if (err) {
            callback(new Error(`Updating Oauth client failed: ${err}`));
            return;
        } else if (res.statusCode >= 400 && body['errors']) {
            callback(new Error(`Updating Oauth client failed: ${body['errors'][0]['message']}`));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(`Updating Oauth client failed: ${res.statusCode}`));
            return;
        }

        // do the callback with the body
        callback(errback, body);
    });
}

/**
 * Generates a new secret for rotating credential.
 *
 * @return {String} the generated secret
 */
function generateSecret() {
    return require('generate-password').generate({
        length: 24,
        numbers: true,
        symbols: true,
        lowercase: true,
        uppercase: true,
        excludeSimilarCharacters: false,
        exclude: '',
        strict: true
    });
}

/**
 * Rotates the credentials of an Oauth client.
 *
 * @param {Object} client the Oauth client to rotate the secret for
 * @param {Function} callback the callback to execute, the error and the secret are available as arguments to the callback function
 */
function rotateCredentials(client, callback) {

    // build the request options
    var options = getOptions(API_BASE + '/apiclients/' + client['id'], auth.getToken(), 'PUT');

    // create a new secret
    var secret = generateSecret();

    // merge changes with Oauth client
    var updatedClient = Object.assign(client, { password : secret });

    // the payload
    options['body'] = updatedClient;

    // do the request
    request.put(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);

        if ( errback ) {
            callback(errback);
            return;
        } else if (err) {
            callback(new Error(`Rotating secret failed: ${err}`));
            return;
        } else if (res.statusCode >= 400 && body['errors']) {
            callback(new Error(`Rotating secret failed: ${body['errors'][0]['message']}`));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(`Rotating secret failed: ${res.statusCode}`));
            return;
        }

        // do the callback
        callback(errback, secret);
    });
}

/**
 * Deletes an existing Oauth client.
 *
 * @param {Object} client the client to delete
 * @param {Function} callback the callback to execute, the error is available as arguments to the callback function
 */
function deleteClient(client, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/apiclients/' + client['id'], auth.getToken(), 'DELETE');

    // do the request
    request.delete(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);

        if ( errback ) {
            callback(errback);
            return;
        } else if (err) {
            callback(new Error(`Deleting Oauth client failed: ${err}`));
            return;
        } else if (res.statusCode >= 400 && body && body['errors']) {
            callback(new Error(`Deleting Oauth client failed: ${body['errors'][0]['message']}`));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(`Deleting Oauth client failed: ${res.statusCode}`));
            return;
        }

        // do the callback
        callback(errback);
    });
}

module.exports.cli = {
    /**
     * Get details of an Oauth clients
     *
     * @param {String} id the id of the Oauth client
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    info : function(id, asJson) {
        getClient(id, function(err, client) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            if (asJson) {
                console.json(client);
                return;
            }

            console.prettyPrint(client);
        });
    },

    /**
     * Update an Oauth client.
     *
     * @param {String} id ID of the Oauth client to update
     * @param {Object} changes changes to the Oauth client details
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    update : function(id, changes, asJson) {
        getClient(id, function(err, client) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            updateClient(client, changes, function(err, updatedClient) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                // the result
                var result = {
                    message : `Oauth client has been updated.`,
                };

                if (asJson) {
                    console.json(updatedClient);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Rotate credentials of an Oauth client.
     *
     * @param {String} id ID of the Oauth client to rotate credentials for
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    rotate : function(id, asJson) {
        getClient(id, function(err, client) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            rotateCredentials(client, function(err, secret) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                // the result
                var result = {
                    message : `Oauth client credentials rotated.`,
                    secret : secret
                };

                if (asJson) {
                    console.json(result);
                    return;
                }

                console.info(result['message']);
                console.info(result['secret']);
            });
        });
    },

    /**
     * Delete an Oauth client
     *
     * @param {String} id ID of the client to delete
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    delete : function(id, asJson) {
        getClient(id, function(err, client) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            deleteClient(client, function(err) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                // the result
                var result = {
                    message : `Oauth client deleted.`,
                };

                if (asJson) {
                    console.json(result);
                    return;
                }

                console.info(result['message']);
            });
        });
    }
};