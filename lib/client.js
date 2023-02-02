/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
const fs = require('fs');

var request = require('request');

var auth = require('./auth');
var console = require('./log');

const API_BASE = '/dw/rest/v1';

/**
 * Helper to capture most-common responses due to errors which occur across resources. In case a well-known issue
 * was identified, the function returns an Error object holding detailed information about the error.
 *
 * @param {Object} err
 * @param {Object} response
 * @return {Error} the error or null
 */
function captureCommonErrors(err, response) {
    if (err && !response) {
        return new Error('The operation could not be performed properly. ' + ( process.env.DEBUG ? err : '' ));
    } else if (response.statusCode === 401) {
        return new Error('Authentication invalid. Please (re-)authenticate by running ' +
            '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´');
    } else if (response.statusCode === 403) {
        return new Error('Operation forbidden. Please make sure, you have the permission to perform this operation.');
    } else if ( response.statusCode === 400 && response.body.errors ) {
        return new Error(`Operation failed. ${response.body.errors[0].message}`);
    } else if ( response.statusCode > 400 ) {
        return new Error(`Operation failed. Error code ${response.statusCode}`);
    }
    return null;
}

/**
 * Transforms the API client representation to an external format. Certain properties are
 * transformed into an object representation.
 *
 * @param {Object} obj the original object
 * @return {Object} the transformed object
 */
function toExternal(obj) {
    // always delete some properties
    delete obj['links'];
    return obj;
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
 * @param {Promise}
 */
async function getClient(id) {
    // build the request options
    var options = getOptions(API_BASE + '/apiclients/' + id, auth.getToken(), 'GET');

    // do the request
    return new Promise(function (resolve, reject) {
        request(options, function (err, res, body) {
            var error = captureCommonErrors(err, res);
            if ( res.statusCode === 404 ) {
                reject(new Error(`Oauth client not found`));
                return;
            } else if ( error ) {
                reject(error);
                return;
            }
            resolve(toExternal(body));
        });
    });
}

/**
 * Retrieves a list of Oauth clients
 *
 * @param {Number} page number of the page starting with 0
 * @param {Number} size size of the page
 * @param {Promise}
 */
async function listClients(page, size) {
    // build the request options
    var options = getOptions(API_BASE + `/apiclients/?size=${size}&page=${page}`, auth.getToken(), 'GET');

    // do the request
    return new Promise(function (resolve, reject) {
        request(options, function (err, res, body) {
            var error = captureCommonErrors(err, res);
            if ( res.statusCode === 404 ) {
                reject(new Error(`No Oauth clients found`));
                return;
            } else if ( error ) {
                reject(error);
                return;
            }
            resolve(body.content);
        });
    });
}

/**
 * Updates an existing Oauth client.
 *
 * @param {Object} client the Oauth client to update
 * @param {Object} changes the changes to make to the Oauth client
 * @param {Promise}
 */
async function updateClient(client, changes) {
    if (changes['password']) {
        return Promise.reject(new Error(`Updating Oauth client failed. Changing password is not supported.`));
    }

    // build the request options
    var options = getOptions(API_BASE + '/apiclients/' + client['id'], auth.getToken(), 'PUT');

    // merge changes with Oauth client
    var updatedClient = Object.assign(client, changes);

    // the payload
    options['body'] = updatedClient;

    // do the request
    return new Promise(function (resolve, reject) {
        request.put(options, function (err, res, body) {
            var error = captureCommonErrors(err, res);
            if ( error ) {
                reject(error);
                return;
            }
            resolve(toExternal(body));
        });
    });
}

/**
 * Creates a new Oauth client.
 *
 * @param {Object} client the details of the Oauth client to create
 * @param {Promise}
 */
async function createClient(client) {
    // build the request options
    var options = getOptions(API_BASE + '/apiclients/', auth.getToken(), 'POST');

    // the payload
    options['body'] = client;

    // do the request
    return new Promise(function (resolve, reject) {
        request.post(options, function (err, res, body) {
            var error = captureCommonErrors(err, res);
            if ( error ) {
                reject(error);
                return;
            }
            resolve(toExternal(body));
        });
    });
}

/**
 * Generates a new secret for rotating credential.
 *
 * @return {String} the generated secret
 */
function generateSecret() {
    // generate using high entropy
    return require('generate-password').generate({
        length: 64,
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
 * Generates a trimmed version of a client id. Only the first 7 characters are returned.
 *
 * @param {String} clientID the unmasked client id
 * @returns {String} the trimmed client id
 */
function trimClientID(clientID) {
    return clientID.slice(0,7);
}

/**
 * Rotates the credentials of an Oauth client.
 *
 * @param {Object} client the Oauth client to rotate the secret for
 * @param {Promise}
 */
async function rotateCredentials(client) {
    // build the request options
    var options = getOptions(API_BASE + '/apiclients', auth.getToken(), 'POST');

    // create a new secret
    var newSecret = generateSecret();

    // set the secret and set description with reference to existing client
    var newDescription = '';
    if ( client.description && /for reference client [a-z0-9]+\./.test(client.description) ) {
        newDescription = client.description.replace(/for reference client [a-z0-9]+\./,
            `for reference client ${trimClientID(client.id)}.`);
    } else if ( !/for reference client [a-z0-9]+\./.test(client.description) ) {
        newDescription = ( client.description ? client.description + ' ' : '' ) +
            `Created through client rotation for reference client ${trimClientID(client.id)}.`;
    }

    // merge config into new Oauth client
    var newClient = Object.assign(client, {
        password : newSecret,
        description : newDescription
    });

    // delete unsupport properties for client creation
    delete newClient.id, newClient.links, newClient.passwordModificationTimestamp, newClient.stateless;
    delete newClient.versionControl, newClient.roleTenantFilterMap;

    // the payload
    options['body'] = newClient;

    // do the request
    return new Promise(function (resolve, reject) {
        request.post(options, function (err, res, body) {
            var error = captureCommonErrors(err, res);
            if ( error ) {
                reject(error);
                return;
            }
            resolve([body, newSecret]);
        });
    });
}

/**
 * Deletes an existing Oauth client.
 *
 * @param {Object} client the client to delete
 * @param {Promise}
 */
async function deleteClient(client) {
    // build the request options
    var options = getOptions(API_BASE + '/apiclients/' + client['id'], auth.getToken(), 'DELETE');

    // do the request
    return new Promise(function (resolve, reject) {
        request.delete(options, function (err, res, body) {
            var error = captureCommonErrors(err, res);
            if ( error ) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

module.exports.trimClientID = trimClientID;
module.exports.cli = {
    /**
     * Get details of an Oauth client
     *
     * @param {String} id the id of the Oauth client
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    info : function(id, asJson) {
        getClient(id).then(client => {
            if (asJson) {
                console.json(client);
                return;
            }
            console.prettyPrint(client);
        }).catch(err => {
            if (asJson) {
                console.json({error: err.message});
            } else {
                console.error(err.message);
            }
        });
    },

    /**
     * Create an Oauth client.
     *
     * @param {Object} client details of the Oauth client to create
     * @param {String} file filename of a file based configuration
     * @param {String} fallbackOrg org used as a fallback and in case no other org was specified
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    create : function(client, file, fallbackOrg, asJson) {
        (new Promise(function(resolve, reject) {
            // assemble client details
            var clientDefinition = {};
            if (!client && file) {
                clientDefinition = JSON.parse(fs.readFileSync(file, 'utf-8'));
            } else {
                clientDefinition = client;
            }
            // fallback to passed org and use this as the API client's organization
            if ((!clientDefinition.organizations || clientDefinition.organizations.length == 0) && fallbackOrg) {
                clientDefinition.organizations = [ fallbackOrg ];
            }
            // finally check, if we have an org
            if (!clientDefinition.organizations || clientDefinition.organizations.length == 0) {
                reject(new Error(`No organization specified`));
                return;
            }
            resolve(clientDefinition);
        })).then(clientDefinition => {
            return createClient(clientDefinition);
        }).then(newClient => {
            // the result
            var result = {
                message : `Oauth client has been created. Generated client ID ${trimClientID(newClient.id)}.`,
                client : newClient
            };
            if (asJson) {
                console.json(result);
                return;
            }
            console.info(result['message']);
        }).catch(err => {
            if (asJson) {
                console.json({error: err.message});
            } else {
                console.error(err.message);
            }
        });
    },

    /**
     * Update an Oauth client.
     *
     * @param {String} id ID of the Oauth client to update
     * @param {Object} changes changes to the Oauth client details
     * @param {String} file filename of a file based configuration
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    update : function(id, changesParam, file, asJson) {
        getClient(id).then(client => {
            // assemble changes
            var changes = {};
            if (!changesParam && file) {
                changes = JSON.parse(fs.readFileSync(file, 'utf-8'));
            } else {
                changes = changesParam;
            }
            // attempt to update
            return updateClient(client, changes);
        }).then(updatedClient => {
            // the result
            var result = {
                message : `Oauth client has been updated.`,
            };
            if (asJson) {
                console.json(updatedClient);
                return;
            }
            console.info(result['message']);
        }).catch(err => {
            if (asJson) {
                console.json({error: err.message});
            } else {
                console.error(err.message);
            }
        });
    },

    /**
     * Rotate credentials of an Oauth client.
     *
     * @param {String} id ID of the Oauth client to rotate credentials for
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    rotate : function(id, asJson) {
        getClient(id).then(referenceClient => {
            return rotateCredentials(referenceClient);
        }).then(newClient => {
            var result = {
                message : `Oauth client credentials rotated. New client ${trimClientID(newClient[0].id)} created.`,
                client : newClient[0],
                secret : newClient[1]
            };

            if (asJson) {
                console.json(result);
                return;
            }

            console.info(result['message']);
            console.info(`Generated secret: ${newClient[1]}`);
        }).catch(err => {
            if (asJson) {
                console.json({error: err.message});
            } else {
                console.error(err.message);
            }
        });
    },

    /**
     * List Oauth clients
     *
     * @param {Number} page page number, starting with 0
     * @param {Number} size page size
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    list : function(page, size, asJson, verbose) {
        listClients(page, size).then(list => {
            if (asJson) {
                console.json(list);
                return;
            }
            // assemble table fields
            const table = list.map(entry => ([(verbose ? entry.id : trimClientID(entry.id)), entry.name,
                entry.description, entry.active, entry.organizations.join(', ')]));
            table.unshift([`id`,'name','description','active','organizations']);
            // print table
            console.table(table, {
                columns : {
                    2 : { width : 50 }
                }
            });
        }).catch(err => {
            if (asJson) {
                console.json({error: err.message});
            } else {
                console.error(err.message);
            }
        });
    },

    /**
     * Delete an Oauth client
     *
     * @param {String} id ID of the client to delete
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    delete : function(id, asJson) {
        getClient(id).then(client => {
            return deleteClient(client);
        }).then(() => {
            var result = {
                message : `Oauth client deleted.`,
            };

            if (asJson) {
                console.json(result);
                return;
            }

            console.info(result['message']);
        }).catch(function (err) {
            if (asJson) {
                console.json({error: err.message});
            } else {
                console.error(err.message);
            }
        });
    }
};