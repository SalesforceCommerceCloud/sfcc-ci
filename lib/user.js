/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var request = require('request');
var util = require('util');

var auth = require('./auth');
var console = require('./log');
var ocapi = require('./ocapi');
var libOrg = require('./org');

const API_BASE = '/dw/rest/v1';
const USER_LIST_PAGE_SIZE = 25;
const USER_ALLOWED_READ_PROPERTIES = [ 'id', 'userState', 'roles', 'roleTenantFilter', 'preferredLocale',
    'preferredlocale', 'primaryOrganization', 'mail', 'firstName', 'lastName', 'displayName', 'organizations' ];
const ROLE_NAMES_MAP = { 'bm-admin' : 'ECOM_ADMIN', 'bm-user' : 'ECOM_USER' };
const ROLE_NAMES_MAP_REVERSE = { 'ECOM_ADMIN' : 'bm-admin', 'ECOM_USER' : 'bm-user' };

/**
 * Maps the role name to an internal role ID accepted by the API.
 *
 * @param {String} role the role name to map
 * @return {String} the internal role ID
 */
function mapToInternalRole(role) {
    if ( typeof(ROLE_NAMES_MAP[role]) !== 'undefined' ) {
        return ROLE_NAMES_MAP[role];
    }
    return role.toUpperCase().replace(/\-/g,'_');
}

/**
 * Maps the internal role ID to role name.
 *
 * @param {String} roleID the role ID to map
 * @return {String} the role name
 */
function mapFromInternalRole(roleID) {
    if ( typeof(ROLE_NAMES_MAP_REVERSE[roleID]) !== 'undefined' ) {
        return ROLE_NAMES_MAP_REVERSE[roleID];
    }
    return roleID.toLowerCase().replace(/\_/g,'-');
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
 * Retrieves details of a user.
 *
 * @param {String} login the login of the user
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the user are available as arguments to the callback function
 */
function getUser(login, token, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users/search/findByLogin/?login=' + login, token || auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if ( res.statusCode === 404 ) {
            callback(new Error(util.format('User %s not found', login)));
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting user failed: %s', res.statusCode)));
            return;
        } else if ( err ) {
            callback(new Error(util.format('Getting user failed: %s', err)));
            return;
        }

        // do the callback with the body
        // filter some properties before returning
        callback(undefined, filterUser(body));
    });
}

/**
 * Filters properties of the passed user object and returns a reduced object containing only
 * an allowed list of properties.
 *
 * @param {Object} user the original user object
 * @return {Object} the filtered user
 */
function filterUser(user) {
    for (var prop in user) {
        if (user.hasOwnProperty(prop) && USER_ALLOWED_READ_PROPERTIES.indexOf(prop) === -1) {
            // delete the property if not allowed to read
            delete user[prop];
        } else if ( prop === 'roleTenantFilter' && user[prop] !== null ) {
            // transform to object form
            var scopeFilters = {};
            var groups = user[prop].split(';');
            for (var i=0; i<groups.length; i++) {
                var role = groups[i].split(':');
                if (role[0] === '') {
                    continue;
                }
                // map to consistent role ID
                var roleID = mapFromInternalRole(role[0]);

                scopeFilters[roleID] = null;
                if (typeof(role[1]) !== 'undefined') {
                    scopeFilters[roleID] = role[1].split(',');
                }
            }
            user[prop] = scopeFilters;
        }
    }
    return user;
}

/**
 * Transforms the passed user object to an internal format accepted by the API.
 *
 * @param {Object} user the filtered user object
 * @return {Object} the internal user object
 */
function toInternalUser(user) {
    for (var prop in user) {
        if ( prop === 'roleTenantFilter' && user[prop] !== null ) {
            // transform to string
            var scopeFilters = [];
            var groups = user[prop];
            for (var group in groups) {
                if ( groups.hasOwnProperty(group) ) {
                    var roleID = mapToInternalRole(group);
                    scopeFilters.push(roleID + ':' + groups[group].join(','));
                }
            }
            user[prop] = scopeFilters.join(';');
        }
    }
    return user;
}

/**
 * Retrieves all users and returns them as list.
 *
 * Note, that using org and role to narrow down the users is only supported
 * in combination by the API, e.g. narrow down to org only is not supported.
 *
 * @param {String} org the org to return users from
 * @param {String} role the role to narrow users to
 * @param {Number} count the max count of items in the list
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error, the result and the list of users of the current page are available as arguments to the callback function
 */
function getUsers(org, role, count, token, callback) {
    // the page size
    var size = USER_LIST_PAGE_SIZE
    if ( count ) {
        size = Number.parseInt(count);
    }

    var endpoint = '/users?page=0&size=' + size;

    // search by org and role
    if ( org && role ) {
        // note, that this endpoint does not support paging, so size is ignored
        endpoint = '/users/search/findByOrgAndRole?organization=' + org + '&role=' + role;
    } else if ( !org && role ) {
        // note, that this endpoint does not support paging, so size is ignored
        endpoint = '/users/search/findByRole?role=' + role;
    }

    // build the request options
    var options = getOptions(API_BASE + endpoint, token || auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Searching users failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Searching users failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, body, body['content']);
    });
}

/**
 * Creates a new user in the passed org.
 *
 * @param {String} orgID the org id to create the user in
 * @param {Object} user the user details
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the created user are available as arguments to the callback function
 */
function createUser(orgID, user, token, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users', token || auth.getToken(), 'POST');

    // update with default roles
    if (typeof(user['roles']) === 'undefined') {
        user['roles'] = [ "xchange-user", "doc-user" ];
    }

    // merge the passed user object with some hard coded properties
    var mergedUser = Object.assign(user, {
        displayName : [ user['firstName'], user['lastName'] ].join(' '),
        organizations : [ orgID ],
        primaryOrganization : orgID,
        userState : "ENABLED"
    });

    // the payload
    options['body'] = mergedUser;

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if (res.statusCode >= 400 && body['errors']) {
            callback(new Error(util.format('Creating user failed: %s (%s)',
                body['errors'][0]['message'], body['errors'][0]['fieldErrors'][0]['defaultMessage'])));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Creating user failed: %s', res.statusCode)));
            return;
        } else if (err) {
            callback(new Error(util.format('Creating user failed: %s', err)));
            return;
        }
        // do the callback with the body
        // filter some properties before returning
        callback(errback, filterUser(body));
    });
}

/**
 * Updates an existing user.
 *
 * @param {Object} user the user to update
 * @param {Object} changes the changes to make to the user
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the updated user are available as arguments to the callback function
 */
function updateUser(user, changes, token, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users/' + user['id'], token || auth.getToken(), 'PUT');

    // merge changes with user
    var updatedUser = Object.assign(user, changes);

    console.debug("Changes: %s", JSON.stringify(changes));
    console.debug("Patched user: %s", JSON.stringify(updatedUser));

    // the payload, transform into internal payload (API properties and internal JSON structure)
    options['body'] = toInternalUser(updatedUser);

    console.debug("Patched internal user: %s", JSON.stringify(options['body']));

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);

        console.debug(body);

        if ( errback ) {
            callback(errback);
            return;
        } else if (err) {
            callback(new Error(util.format('Updating user failed: %s', err)));
            return;
        } else if (res.statusCode >= 400 && body['errors']) {
            callback(new Error(util.format('Updating user failed: %s', body['errors'][0]['message'])));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Updating user failed: %s', res.statusCode)));
            return;
        }

        // do the callback with the body
        // filter some properties before returning
        callback(errback, filterUser(body));
    });
}

/**
 * Deletes an existing user. The deletion happens in Account Manager. The user is only marked as deleted.
 * In order to purge the user completely use the purge flag.
 *
 * @param {Object} user the user to delete
 * @param {Boolean} purge flag, whether to purge the user completely, false by default
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the user are available as arguments to the callback function
 */
function deleteUser(user, purge, token, callback) {
    // for purging we fire a full DELETE request
    if (purge) {
        // build the request options
        var options = getOptions(API_BASE + '/users/' + user['id'], token || auth.getToken(), 'DELETE');

        // do the request
        request(options, function (err, res, body) {
            var errback = captureCommonErrors(err, res);

            console.debug(body);

            if ( errback ) {
                callback(errback);
                return;
            } else if (err) {
                callback(new Error(util.format('Deleting user failed: %s', err)));
                return;
            } else if (res.statusCode >= 400 && body && body['errors']) {
                callback(new Error(util.format('Deleting user failed: %s', body['errors'][0]['message'])));
                return;
            } else if (res.statusCode >= 400) {
                callback(new Error(util.format('Deleting user failed: %s', res.statusCode)));
                return;
            }

            // do the callback
            callback(errback);
        });
    } else {
        // for deletion, just mark the user as deleted via userState
        // build the request options
        var options = getOptions(API_BASE + '/users/' + user['id'], auth.getToken(), 'PUT');

        // modify the userState to DELETED
        var updatedUser = user;
        updatedUser['userState'] = 'DELETED';

        console.debug("Patched user: %s", JSON.stringify(updatedUser));

        // the payload, transform into internal payload (API properties and internal JSON structure)
        options['body'] = toInternalUser(updatedUser);

        console.debug("Patched internal user: %s", JSON.stringify(options['body']));

        // do the request
        request(options, function (err, res, body) {
            var errback = captureCommonErrors(err, res);

            console.debug(body);

            if ( errback ) {
                callback(errback);
                return;
            } else if (err) {
                callback(new Error(util.format('Deleting user failed: %s', err)));
                return;
            } else if (res.statusCode >= 400 && body['errors']) {
                callback(new Error(util.format('Deleting user failed: %s', body['errors'][0]['message'])));
                return;
            } else if (res.statusCode >= 400) {
                callback(new Error(util.format('Deleting user failed: %s', res.statusCode)));
                return;
            }

            // do the callback with the body
            // filter some properties before returning
            callback(errback, filterUser(body));
        });
    }
}

/**
 * Creates a new local user in the passed instance.
 *
 * @param {String} instance the instance to create the user in
 * @param {String} login the login of the user
 * @param {Object} user the user details
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the created user are available as arguments to the callback function
 */
function createLocalUser(instance, login, user, token, callback) {
    // error, in case password has been provided
    // the user has to set his password via link in activation email sent by the instance
    if ( user['password'] ) {
        callback(new Error(util.format('Creating user %s failed: Providing a user password is not allowed', login)));
        return;
    }

    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/users/' + login;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token || auth.getToken(), 'PUT');

    // merge the passed user object with some hard coded properties
    var mergedUser = Object.assign(user, {
        login : login
    });

    // the payload
    options['body'] = mergedUser;

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Creating user %s failed: %s', login, err)));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Creating user %s failed: %s', login, res.statusCode)));
            return;
        }
        // do the callback with the body
        callback(undefined, body);
    });
}

/**
 * Retrieves details of a local user.
 *
 * @param {String} login the login of the local user
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the user are available as arguments to the callback function
 */
function getLocalUser(instance, login, token, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/users/' + login;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token || auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if ( res.statusCode === 404 ) {
            callback(new Error(util.format('User %s not found on %s', login, instance)));
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting user failed: %s', res.statusCode)));
            return;
        } else if ( err ) {
            callback(new Error(util.format('Getting user failed: %s', err)));
            return;
        }

        // do the callback with the body
        // filter some properties before returning
        callback(undefined, body);
    });
}

/**
 * Updates an existing local user in the passed instance.
 *
 * @param {String} instance the instance to update the user on
 * @param {Object} user the local user to update
 * @param {Object} changes the changes to apply to the user
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the updated user are available as arguments
 */
function updateLocalUser(instance, user, changes, token, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/users/' + user['login'];

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token || auth.getToken(), 'PATCH');

    // add resource_state required for deletion
    options['headers'] = {
        'x-dw-resource-state' : user['_resource_state']
    };

    // the payload
    options['body'] = changes;

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Updating user %s failed: %s', login, err)));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Updating user %s failed: %s', login, res.statusCode)));
            return;
        }
        // do the callback with the body
        callback(undefined, body);
    });
}

/**
 * Grant a role to a local user on the passed instance
 *
 * @param {String} instance instance to grant the user the role on
 * @param {String} login the login of the user
 * @param {String} role the role to grant
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the changed user are available as arguments to the callback function
 */
function grantLocalRole(instance, login, role, token, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/roles/' + role + '/users/' + login;
    var options = ocapi.getOptions(instance, endpoint, token || auth.getToken(), 'PUT');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Granting user %s role %s failed: %s', login, role, err)));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Creating user %s role %s failed: %s', login, role, res.statusCode)));
            return;
        }
        // do the callback with the body
        callback(undefined, body);
    });
}

/**
 * Revoke a role from a local user on the passed instance
 *
 * @param {String} instance instance to revoke the user the role from
 * @param {String} login the login of the user
 * @param {String} role the role to revoke
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the changed user are available as arguments to the callback function
 */
function revokeLocalRole(instance, login, role, token, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/roles/' + role + '/users/' + login;
    var options = ocapi.getOptions(instance, endpoint, token || auth.getToken(), 'DELETE');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Revoking role %s from user %s failed: %s', login, role, err)));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Revoking role %s from user %s failed: %s', login, role, res.statusCode)));
            return;
        }
        // do the callback with the body
        callback(undefined, body);
    });
}

/**
 * Delete a local user from the passed instance.
 *
 * @param {String} instance the instance to create the user in
 * @param {String} login the login of the user
 * @param {String} state resource state before deletion
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error is available as argument to the callback function
 */
function deleteLocalUser(instance, login, state, token, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/users/' + login;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token || auth.getToken(), 'DELETE');

    // add resource_state required for deletion
    if ( state ) {
        options['headers'] = {
            'x-dw-resource-state' : state
        };
    }

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Deleting the user %s failed: %s', login, err)));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Deleting the user %s failed: %s', login, res.statusCode)));
            return;
        }
        // do the callback without error
        callback(undefined);
    });
}

/**
 * Search local users on an instance
 *
 * @param {String} instance the instance to search users on
 * @param {String} query the query to search users for
 * @param {String} role the role to search users for
 * @param {String} sortBy the field to sort users by
 * @param {String} count optional number of items per page
 * @param {String} start zero-based index of the first search hit to include
 * @param {String} token oauth token
 * @param {Boolean} callback the callback to execute, the error, the result and the list of users of the current page are available as arguments to the callback function
 */
function searchLocalUsers(instance, query, role, sortBy, count, start, token, callback) {
    // the page size
    var size = USER_LIST_PAGE_SIZE
    if ( count ) {
        size = Number.parseInt(count);
    }

    // the item index
    var index = 0
    if ( start ) {
        index = Number.parseInt(start);
    }

    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/user_search';
    if ( role ) {
        endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/roles/' + role + '/user_search';
    }

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token || auth.getToken(), 'POST');

    // default query, match all
    var q = {
        match_all_query : {}
    };
    // use a user provided query
    if ( query ) {
        q = query;
    }

    // the payload
    options['body'] = {
        count : size,
        query : q,
        select : '(**)',
        start : index
    };

    // apply sorting
    if ( sortBy ) {
        options['body']['sorts'] = [{
            field : sortBy
        }];
    }

    // in order to support processing larger amounts of users, we fall back to GET /users endpoint
    // with no querying or sorting
    if ( !query && !role && !sortBy && count > 200 ) {
        // modify the request options
        var options = ocapi.getOptions(instance, '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/users?count=' +
            size + '&select=(**)', token || auth.getToken(), 'GET');
    }

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Searching users failed: %s', err)));
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Searching users failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, body, body['hits'] || body['data']);
    });
}

/**
 * Grant an existing AM user a new role, or extend an already granted role with a scope.
 *
 * @param {Object} user the user to grant the role for
 * @param {String} role the role to grant
 * @param {String} scope the optional scope of the role
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the changed user are available as arguments to the callback function
 */
function grantRole(user, role, scope, token, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users/' + user['id'], token || auth.getToken(), 'PUT');

    console.debug("Existing user: %s", JSON.stringify(user));

    // merge the user object with new role / scope
    var mergedUser = user;
    if ( user['roles'] && user['roles'].indexOf(role) === -1 ) {
        mergedUser['roles'] = user['roles'].concat([role]);
    }

    // merge the user object with expanded scope
    if ( scope ) {
        var scopes = scope.split(',');

        if ( user['roleTenantFilter'] && typeof(user['roleTenantFilter'][role]) !== 'undefined' ) {
            // expand scope of existing role
            mergedUser['roleTenantFilter'] = user['roleTenantFilter'];
            mergedUser['roleTenantFilter'][role] = mergedUser['roleTenantFilter'][role].concat(scopes);
        } else if ( user['roleTenantFilter'] && typeof(user['roleTenantFilter'][role]) === 'undefined' ) {
            // add scope for new role
            mergedUser['roleTenantFilter'] = user['roleTenantFilter'];
            mergedUser['roleTenantFilter'][role] = scopes;
        } else if ( !typeof(user['roleTenantFilter']) ) {
            // create new tenant filter map
            mergedUser['roleTenantFilter'] = {
                role : scopes
            }
        }
    }

    console.debug("Patched user: %s", JSON.stringify(mergedUser));

    // the payload, transform into internal payload (API properties and internal JSON structure)
    options['body'] = toInternalUser(mergedUser);

    console.debug("Patched internal user: %s", JSON.stringify(options['body']));

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);

        console.debug(body);

        if ( errback ) {
            callback(errback);
            return;
        } else if (err) {
            callback(new Error(util.format('Granting role failed: %s', err)));
            return;
        } else if (res.statusCode >= 400 && body['errors']) {
            callback(new Error(util.format('Granting role failed: %s', body['errors'][0]['message'])));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Granting role failed: %s', res.statusCode)));
            return;
        }

        // do the callback with the body
        // filter some properties before returning
        callback(errback, filterUser(body));
    });
}

/**
 * Revoke a role from an existing AM user, or reduce the scope of a granted role.
 *
 * @param {Object} user the user to revoke the role from
 * @param {String} role the role to revoke
 * @param {String} scope the optional scope of the role to reduce
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the changed user are available as arguments to the callback function
 */
function revokeRole(user, role, scope, token, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users/' + user['id'], token || auth.getToken(), 'PUT');

    console.debug("Existing user: %s", JSON.stringify(user));

    // remove the complete role (incl. all scopes if used)
    var mergedUser = user;
    if ( user['roles'] && user['roles'].indexOf(role) !== -1 && !scope ) {
        var roleIndex = user['roles'].indexOf(role);

        // remove the role
        mergedUser['roles'].splice(roleIndex, 1);
        // remove all scopes
        if (user['roleTenantFilter'] && typeof(mergedUser['roleTenantFilter'][role]) !== 'undefined') {
            delete mergedUser['roleTenantFilter'][role];
        }
    }

    // reduce only by passed scope, but leave role and other scopes
    if ( scope ) {
        var scopes = scope.split(',');

        if ( user['roleTenantFilter'] && typeof(user['roleTenantFilter'][role]) !== 'undefined' ) {
            for (var i=0; i<scopes.length; i++) {
                var scopeIndex = user['roleTenantFilter'][role].indexOf(scopes[i]);
                if ( scopeIndex > -1 ) {
                    mergedUser['roleTenantFilter'][role].splice(scopeIndex, 1);
                }
            }
            // if zero scope left, remove completely from map
            if ( mergedUser['roleTenantFilter'][role].length === 0 ) {
                delete mergedUser['roleTenantFilter'][role];
            }
        }
    }

    console.debug("Patched user: %s", JSON.stringify(mergedUser));

    // the payload, transform into internal payload (API properties and internal JSON structure)
    options['body'] = toInternalUser(mergedUser);

    console.debug("Patched internal user: %s", JSON.stringify(options['body']));

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);

        console.debug(body);

        if ( errback ) {
            callback(errback);
            return;
        } else if (err) {
            callback(new Error(util.format('Revoking role failed: %s', err)));
            return;
        } else if (res.statusCode >= 400 && body['errors']) {
            callback(new Error(util.format('Revoking role failed: %s', body['errors'][0]['message'])));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(util.format('Revoking role failed: %s', res.statusCode)));
            return;
        }

        // do the callback with the body
        // filter some properties before returning
        callback(errback, filterUser(body));
    });
}

/**
 * Convenience function to print user access roles
 *
 * @param {Array} roles an array of roles to print
 */
function prettyPrintRoles(roles) {
    if (!roles || roles.length == 0) {
        return;
    } else if (roles.indexOf('Administrator') !== -1 && roles.length >= 2) {
        return 'Administrator (+' + roles.length + ' more)';
    } else if (roles.indexOf('Administrator') !== -1) {
        return 'Administrator';
    } else {
        return roles[0] + ( roles.length > 1 ? ' (+' + roles.length + ' more)' : '' );
    }
};

module.exports.cli = {
    /**
     * Creates a new user.
     *
     * @param {String} org the org to create the user in
     * @param {Object} user the user details
     * @param {String} mail the login (email) of the new user (must be unique)
     * @param {String} firstName the first name
     * @param {String} lastName the last name
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    create : function(org, user, mail, firstName, lastName, asJson, token, callback) {
        // respect user, login, firstName and lastName (if passed)
        if (typeof(user) === 'undefined' || user === null) {
            user = {};
        }
        if (typeof(mail) !== 'undefined' && mail !== null) {
            user['mail'] = mail;
        }
        if (typeof(firstName) !== 'undefined' && firstName !== null) {
            user['firstName'] = firstName;
        }
        if (typeof(lastName) !== 'undefined' && lastName !== null) {
            user['lastName'] = lastName;
        }

        libOrg.getOrg(org, token, function(err, foundOrg) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            createUser(foundOrg['id'], user, token, function(err, newUser) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, newUser);
                    return;
                }

                // the result
                var result = {
                    message : util.format('New user %s in org %s created.', newUser.mail, org),
                };

                if (asJson) {
                    console.json(newUser);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Lists all users eligible to manage
     *
     * @param {String} org the org or null, if all users should be retrieved
     * @param {String} role the role or null, if all users should be retrieved
     * @param {String} login the login or null, if all users should be retrieved
     * @param {Number} count the max count of list items
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of users by
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    list : function(org, role, login, count, asJson, sortBy, token, callback) {
        // get details of a single user if login was passed
        if ( typeof(login) !== 'undefined' && login !== null ) {
            getUser(login, token, function(err, user) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, [user]);
                    return;
                }

                if (asJson) {
                    console.json(user);
                    return;
                }

                console.prettyPrint(user);
            });
            return;
        }
        // get users
        // define the callback
        var getUsersCallback = function(err, result, list) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }

            if (sortBy) {
                list = require('./json').sort(list, sortBy);
            }

            if (typeof callback !== 'undefined') {
                callback(undefined, list);
                return;
            }

            if (asJson) {
                // if sorted, then only provide the list of the current page
                if (sortBy) {
                    console.json(list);
                } else {
                    console.json(result);
                }
                return;
            }

            if (list.length === 0) {
                console.info('No users found');
                return;
            }

            // table fields
            var data = [['mail','firstName','lastName','userState']];
            for (var i of list) {
                data.push([i.mail, i.firstName, i.lastName, i.userState]);
            }

            console.table(data);
        };

        // in case org was passed, resolve org uuid
        if ( org ) {
            libOrg.getOrg(org, token, function(err, foundOrg) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }
                getUsers(foundOrg['id'], role, count, token, getUsersCallback);
            });
            return;
        }
        // no org was passed
        getUsers(null, role, count, token, getUsersCallback);
    },

    /**
     * Update a user.
     *
     * @param {String} login login of the user to update
     * @param {Object} changes changes to the user details
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    update : function(login, changes, asJson, token, callback) {
        getUser(login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            updateUser(user, changes, token, function(err, updatedUser) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, updatedUser);
                    return;
                }

                // the result
                var result = {
                    message : util.format('User %s has been updated.', login),
                };

                if (asJson) {
                    console.json(updatedUser);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Grant a role to a user
     *
     * @param {String} login the login (email) of the user
     * @param {String} role the role to grant
     * @param {String} scope the scope of the role to grant
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    grant : function(login, role, scope, asJson, token, callback) {
        if (typeof(login) === 'undefined' || login === null) {
            console.error("Missing login. Please pass a login using -l,--login");
            return;
        }
        if (typeof(role) === 'undefined' || role === null) {
            console.error("Missing role. Please pass a role using -r,--role");
            return;
        }
        getUser(login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            grantRole(user, role, scope, token, function(err, changedUser) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, changedUser);
                    return;
                }

                // the result
                var result = {
                    message : util.format('User %s granted role %s.', login, role),
                };

                if (scope) {
                    result['message'] = util.format('User %s granted role %s with scope %s.', login, role, scope);
                }

                if (asJson) {
                    console.json(changedUser);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Revoke a role from a user
     *
     * @param {String} login the login (email) of the user
     * @param {String} role the role to revoke
     * @param {String} scope the scope of the role to revoke
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    revoke : function(login, role, scope, asJson, token, callback) {
        if (typeof(login) === 'undefined' || login === null) {
            console.error("Missing login. Please pass a login using -l,--login");
            return;
        }
        if (typeof(role) === 'undefined' || role === null) {
            console.error("Missing role. Please pass a role using -r,--role");
            return;
        }
        getUser(login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            revokeRole(user, role, scope, token, function(err, changedUser) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, changedUser);
                    return;
                }

                // the result
                var result = {
                    message : util.format('User %s revoked role %s.', login, role),
                };

                if (scope) {
                    result['message'] = util.format('User %s revoked role %s with scope %s.', login, role, scope);
                }

                if (asJson) {
                    console.json(changedUser);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Delete a user.
     *
     * @param {Object} login the user to delete
     * @param {Boolean} purge whether to purge the user completely
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    delete : function(login, purge, asJson, token, callback) {
        getUser(login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            deleteUser(user, purge, token, function(err) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }


                if (typeof callback !== 'undefined') {
                    callback(undefined, true);
                    return;
                }

                // the result
                var result = {
                    message : util.format('User %s %s.', login, ( purge ? 'purged' : 'deleted' )),
                };

                if (asJson) {
                    console.json(result);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Creates a new local user on an instance.
     *
     * @param {String} instance the instance to create the user on
     * @param {String} login the login of the user
     * @param {Object} user the user details
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    createLocal : function(instance, login, user, asJson, token, callback) {
        if (typeof(user) === 'undefined' || user === null) {
            console.error("Missing user details. Please pass details using -u,--user");
            return;
        }
        if (typeof(login) === 'undefined' || login === null) {
            console.error("Missing login. Please pass a login using -l,--login");
            return;
        }
        createLocalUser(instance, login, user, token, function(err, newUser) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }

            if (typeof callback !== 'undefined') {
                callback(undefined, newUser);
                return;
            }

            // the result
            var result = {
                message : util.format('New user %s in instance %s created.', newUser.login, instance),
            };

            if (asJson) {
                console.json(newUser);
                return;
            }

            console.info(result['message']);
        });
    },

    /**
     * Search for local users on an instance
     *
     * @param {String} instance the instance to search users on
     * @param {String} login the login or null, if all users should be retrieved
     * @param {String} query the query to search users for
     * @param {String} role the role to search users for
     * @param {String} sortBy optional field to sort users by
     * @param {String} count optional number of items per page
     * @param {String} start optional zero-based index of the first search hit to include
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    searchLocal : function(instance, login, query, role, sortBy, count, start, asJson, token, callback) {
        // get details of a single user if login was passed
        if ( typeof(login) !== 'undefined' && login !== null ) {
            getLocalUser(instance, login, token, function(err, user) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, [user]);
                    return;
                }

                if (asJson) {
                    console.json(user);
                    return;
                }

                console.prettyPrint(user);
            });
            return;
        }
        // get all users
        searchLocalUsers(instance, query, role, sortBy, count, start, token, function(err, result, list) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }

            if (typeof callback !== 'undefined') {
                callback(undefined, list);
                return;
            }

            if (asJson) {
                // silently make list of users contained in property data available via property hits
                if (typeof(result['hits']) == 'undefined' && typeof(result['data']) != 'undefined' ) {
                    result['hits'] = result['data'];
                }
                console.json(result);
                return;
            }

            if (result.total === 0) {
                console.info('No users found');
                return;
            }

            // table fields
            var data = [['login','email','first_name','last_name','disabled', 'external_id', 'roles']];
            for (var i of list) {
                data.push([i.login, i.email, i.first_name, i.last_name, i.disabled, i.external_id,
                    prettyPrintRoles(i.roles)]);
            }

            console.table(data);
        });
    },

    /**
     * Update a local user.
     *
     * @param {String} instance instance to grant the user the role on
     * @param {String} login login of the local user to update
     * @param {Object} changes changes to the user details
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    updateLocal : function(instance, login, changes, asJson, token, callback) {
        if (typeof(instance) === 'undefined' || instance === null) {
            console.error('Missing instance. Please pass an instance using -i,--instance');
            return;
        }
        if (typeof(login) === 'undefined' || login === null) {
            console.error('Missing login. Please pass a login using -l,--login');
            return;
        }
        getLocalUser(instance, login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            updateLocalUser(instance, user, changes, token, function(err, updatedUser) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }


                if (typeof callback !== 'undefined') {
                    callback(undefined, updatedUser);
                    return;
                }

                // the result
                var result = {
                    message : util.format('User %s has been updated on %s.', login, instance),
                };

                if (asJson) {
                    console.json(updatedUser);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Grant a role to a local user
     *
     * @param {String} instance instance to grant the user the role on
     * @param {String} login the login of the user
     * @param {String} role the role to grant
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    grantLocal : function(instance, login, role, asJson, token, callback) {
        if (typeof(instance) === 'undefined' || instance === null) {
            console.error('Missing instance. Please pass an instance using -i,--instance');
            return;
        }
        if (typeof(login) === 'undefined' || login === null) {
            console.error('Missing login. Please pass a login using -l,--login');
            return;
        }
        if (typeof(role) === 'undefined' || role === null) {
            console.error('Missing role. Please pass a role using -r,--role');
            return;
        }
        getLocalUser(instance, login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            grantLocalRole(instance, login, role, token, function(err, changedUser) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, changedUser);
                    return;
                }

                // the result
                var result = {
                    message : util.format('Granted role %s to user %s on %s', role, login, instance),
                };

                if (asJson) {
                    console.json(changedUser);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Revoke a role from a local user
     *
     * @param {String} instance instance to revoke the user the role from
     * @param {String} login the login of the user
     * @param {String} role the role to revoke
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    revokeLocal : function(instance, login, role, asJson, token, callback) {
        if (typeof(instance) === 'undefined' || instance === null) {
            console.error('Missing instance. Please pass an instance using -i,--instance');
            return;
        }
        if (typeof(login) === 'undefined' || login === null) {
            console.error('Missing login. Please pass a login using -l,--login');
            return;
        }
        if (typeof(role) === 'undefined' || role === null) {
            console.error('Missing role. Please pass a role using -r,--role');
            return;
        }
        getLocalUser(instance, login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            revokeLocalRole(instance, login, role, token, function(err, changedUser) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, changedUser);
                    return;
                }

                // the result
                var result = {
                    message : util.format('Revoked role %s from user %s on %s.', role, login, instance),
                };

                if (asJson) {
                    console.json(changedUser);
                    return;
                }

                console.info(result['message']);
            });
        });
    },

    /**
     * Delete a local user.
     *
     * @param {String} instance instance to delete the user from
     * @param {Object} login the user to delete
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} token oauth token
     * @param {Function} callback callback function to call when called through the Javascript API
     */
    deleteLocal : function(instance, login, asJson, token, callback) {
        getLocalUser(instance, login, token, function(err, user) {
            if (err) {
                if (typeof callback !== 'undefined') {
                    callback(err, undefined);
                    return;
                }

                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            deleteLocalUser(instance, login, user['_resource_state'], token, function(err) {
                if (err) {
                    if (typeof callback !== 'undefined') {
                        callback(err, undefined);
                        return;
                    }

                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                        console.error(err.message);
                    }
                    return;
                }

                if (typeof callback !== 'undefined') {
                    callback(undefined, true);
                    return;
                }

                // the result
                var result = {
                    message : util.format('User %s deleted from %s.', login, instance),
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

module.exports.api = {
    /**
     * Creates a new user.
     *
     * @param {String} org the org to create the user in
     * @param {Object} user the user details
     * @param {String} mail the login (email) of the new user (must be unique)
     * @param {String} firstName the first name
     * @param {String} lastName the last name
     * @param {String} token oauth token
     */
    create: (org, user, mail, firstName, lastName, token) => new Promise((resolve, reject) => {
        module.exports.cli.create(org, user, mail, firstName, lastName, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Lists all users eligible to manage
     *
     * @param {String} org the org or null, if all users should be retrieved
     * @param {String} role the role or null, if all users should be retrieved
     * @param {String} login the login or null, if all users should be retrieved
     * @param {Number} count the max count of list items
     * @param {String} sortBy optional field to sort the list of users by
     * @param {String} token oauth token
     */
    list: (org, role, login, count, sortBy, token) => new Promise((resolve, reject) => {
        module.exports.cli.list(org, role, login, count, false, sortBy, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Update a user.
     *
     * @param {String} login login of the user to update
     * @param {Object} changes changes to the user details
     * @param {String} token oauth token
     */
    update: (login, changes, token) => new Promise((resolve, reject) => {
        module.exports.cli.update(login, changes, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Grant a role to a user
     *
     * @param {String} login the login (email) of the user
     * @param {String} role the role to grant
     * @param {String} scope the scope of the role to grant
     * @param {String} token oauth token
     */
    grant: (login, role, scope, token) => new Promise((resolve, reject) => {
        module.exports.cli.grant(login, role, scope, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Revoke a role from a user
     *
     * @param {String} login the login (email) of the user
     * @param {String} role the role to revoke
     * @param {String} scope the scope of the role to revoke
     * @param {String} token oauth token
     */
    revoke: (login, role, scope, token) => new Promise((resolve, reject) => {
        module.exports.cli.revoke(login, role, scope, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Delete a user.
     *
     * @param {Object} login the user to delete
     * @param {Boolean} purge whether to purge the user completely
     * @param {String} token oauth token
     */
    delete: (login, purge, token) => new Promise((resolve, reject) => {
        module.exports.cli.delete(login, purge, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Creates a new local user on an instance.
     *
     * @param {String} instance the instance to create the user on
     * @param {String} login the login of the user
     * @param {Object} user the user details
     * @param {String} token oauth token
     */
    createLocal: (instance, login, user, token) => new Promise((resolve, reject) => {
        module.exports.cli.createLocal(instance, login, user, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Search for local users on an instance
     *
     * @param {String} instance the instance to search users on
     * @param {String} login the login or null, if all users should be retrieved
     * @param {String} query the query to search users for
     * @param {String} role the role to search users for
     * @param {String} sortBy optional field to sort users by
     * @param {String} count optional number of items per page
     * @param {String} start optional zero-based index of the first search hit to include
     * @param {String} token oauth token
     */
    searchLocal: (instance, login, query, role, sortBy, count, start, token) => new Promise((resolve, reject) => {
        module.exports.cli.searchLocal(instance, login, query, role, sortBy, count, start, false, token,
            (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(result);
            });
    }),
    /**
     * Update a local user.
     *
     * @param {String} instance instance to grant the user the role on
     * @param {String} login login of the local user to update
     * @param {Object} changes changes to the user details
     * @param {String} token oauth token
     */
    updateLocal: (instance, login, changes, token) => new Promise((resolve, reject) => {
        module.exports.cli.updateLocal(instance, login, changes, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Grant a role to a local user
     *
     * @param {String} instance instance to grant the user the role on
     * @param {String} login the login of the user
     * @param {String} role the role to grant
     * @param {String} token oauth token
     */
    grantLocal: (instance, login, role, token) => new Promise((resolve, reject) => {
        module.exports.cli.grantLocal(instance, login, role, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Revoke a role from a local user
     *
     * @param {String} instance instance to revoke the user the role from
     * @param {String} login the login of the user
     * @param {String} role the role to revoke
     * @param {String} token oauth token
     */
    revokeLocal: (instance, login, role, token) => new Promise((resolve, reject) => {
        module.exports.cli.revokeLocal(instance, login, role, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    }),
    /**
     * Delete a local user.
     *
     * @param {String} instance instance to delete the user from
     * @param {Object} login the user to delete
     * @param {String} token oauth token
     */
    deleteLocal: (instance, login, token) => new Promise((resolve, reject) => {
        module.exports.cli.deleteLocal(instance, login, false, token, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    })
};