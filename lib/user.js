var request = require('request');
var util = require('util');

var auth = require('./auth');
var console = require('./log');
var ocapi = require('./ocapi');
var libRole = require('./role');

const API_BASE = '/dw/rest/v1';
const USER_LIST_PAGE_SIZE = 25;
const USER_ALLOWED_READ_PROPERTIES = [ 'id', 'userState', 'roles', 'roleTenantFilter', 'primaryOrganization', 'mail',
    'firstName', 'lastName', 'displayName' ];
const ORG_ALLOWED_READ_PROPERTIES = [ 'id', 'name', 'realms', 'twoFARoles' ];
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
    } else if (response.statusCode === 401) {
        error = new Error('Authentication invalid. Please (re-)authenticate by running ' +
            '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´');
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
 * Retrieves detals of an org
 *
 * @param {String} org the name of the org
 * @param {Function} callback the callback to execute, the error and the org are available as arguments to the callback function
 */
function getOrg(org, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/organizations/search/findByName?startsWith=' + org + '&ignoreCase=false',
        auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Getting org failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting org failed: %s', res.statusCode)));
            return;
        } else if ( body['content'].length === 0 ) {
            callback(new Error(util.format('Unknown org %s', org)));
            return;
        } else if ( body['content'].length > 1 ) {
            callback(new Error(util.format('Org %s is ambiguous', org)));
            return;
        }
        // do the callback with the body
        callback(undefined, body['content'][0]);
    });
}

/**
 * Filters properties of the passed user org and returns a reduced object containing only
 * an allowed list of properties.
 *
 * @param {Object} org the original org object
 * @return {Object} the filtered org
 */
function filterOrg(org) {
    for (var prop in user) {
        if (user.hasOwnProperty(prop) && ORG_ALLOWED_READ_PROPERTIES.indexOf(prop) === -1) {
            // delete the property if not allowed to read
            delete user[prop];
        }
    }
    return org;
}

/**
 * Retrieves details of a user.
 *
 * @param {String} login the login of the user
 * @param {Function} callback the callback to execute, the error and the user are available as arguments to the callback function
 */
function getUser(login, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users/search/findByLogin/?login=' + login, auth.getToken(), 'GET');

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
 * @param {Number} count the max count of items in the list
 * @param {Function} callback the callback to execute, the error and the list of users are available as arguments to the callback function
 */
function getUsers(count, callback) {
    // the page size
    var size = USER_LIST_PAGE_SIZE
    if ( count ) {
        size = Number.parseInt(count);
    }

    // build the request options
    var options = getOptions(API_BASE + '/users?page=0&size=' + size, auth.getToken(), 'GET');

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
        callback(undefined, body['content']);
    });
}

/**
 * Creates a new user in the passed org.
 *
 * @param {String} orgID the org id to create the user in
 * @param {Object} user the user details
 * @param {Function} callback the callback to execute, the error and the created user are available as arguments to the callback function
 */
function createUser(orgID, user, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users', auth.getToken(), 'POST');

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
    request.post(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if (res.statusCode >= 400 && body['errors']) {
            callback(new Error(util.format('Creating user failed: %s',
                body['errors'][0]['fieldErrors'][0]['defaultMessage'])));
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
 * Retrieves details of a local user.
 *
 * @param {String} login the login of the local user
 * @param {Function} callback the callback to execute, the error and the user are available as arguments to the callback function
 */
function getLocalUser(instance, login, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/users/' + login;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, auth.getToken(), 'GET');

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
 * Search local users on an instance
 *
 * @param {String} instance the instance to search users on
 * @param {String} query the query to search users for
 * @param {String} role the role to search users for
 * @param {String} sortBy the field to sort users by
 * @param {Boolean} callback the callback to execute, the error, the body and the list of users are available as arguments to the callback function
 */
function searchLocalUsers(instance, query, role, sortBy, count, callback) {
    // the page size
    var size = USER_LIST_PAGE_SIZE
    if ( count ) {
        size = Number.parseInt(count);
    }

    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/user_search';
    if ( role ) {
        endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/roles/' + role + '/user_search';
    }

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, auth.getToken(), 'POST');

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
        select : '(**)'
    };

    // apply sorting
    if ( sortBy ) {
        options['body']['sorts'] = [{
            field : sortBy
        }];
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
        callback(undefined, body, body['hits']);
    });
}

/**
 * Grant an existing AM user a new role, or extend an already granted role with a scope.
 *
 * @param {Object} user the user to grant the role for
 * @param {String} role the role to grant
 * @param {String} scope the optional scope of the role
 * @param {Function} callback the callback to execute, the error and the changed user are available as arguments to the callback function
 */
function grantRole(user, role, scope, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users/' + user['id'], auth.getToken(), 'PUT');

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
    request.put(options, function (err, res, body) {
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
 * @param {Function} callback the callback to execute, the error and the changed user are available as arguments to the callback function
 */
function revokeRole(user, role, scope, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/users/' + user['id'], auth.getToken(), 'PUT');

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
    request.put(options, function (err, res, body) {
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

module.exports.cli = {
    /**
     * Lists all users eligible to manage
     *
     * @param {Number} count the max count of list items
     * @param {String} login the login or null, if all users should be retrieved
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of users by
     */
    list : function(count, login, asJson, sortBy) {
        // get details of a single user if login was passed
        if ( typeof(login) !== 'undefined' && login !== null ) {
            getUser(login, function(err, user) {
                if (err) {
                    if (asJson) {
                        console.json({error: err.message});
                    } else {
                    console.error(err.message);
                    }
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
        getUsers(count, function(err, list) {
            if (err) {
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

            if (asJson) {
                console.json(list);
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
        });
    },

    /**
     * Creates a new user.
     *
     * @param {String} org the org to create the user in
     * @param {Object} user the user details
     * @param {String} mail the login (email) of the new user (must be unique)
     * @param {String} firstName the first name
     * @param {String} lastName the last name
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    create : function(org, user, mail, firstName, lastName, asJson) {
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

        getOrg(org, function(err, foundOrg) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            createUser(foundOrg['id'], user, function(err, newUser) {
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
     * Searches user
     *
     * @param {String} instance the instance to search users on
     * @param {String} login the login or null, if all users should be retrieved
     * @param {String} query the query to search users for
     * @param {String} role the role to search users for
     * @param {String} sortBy optional field to sort users by
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    searchLocal : function(instance, login, query, role, sortBy, count, asJson) {
        // get details of a single user if login was passed
        if ( typeof(login) !== 'undefined' && login !== null ) {
            getLocalUser(instance, login, function(err, user) {
                if (err) {
                    console.error(err.message);
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
        searchLocalUsers(instance, query, role, sortBy, count, function(err, userResult, list) {
            if (err) {
                console.error(err.message);
                return;
            }

            if (asJson) {
                console.json(userResult);
                return;
            }

            if (userResult.total === 0) {
                console.info('No users found');
                return;
            }

            // table fields
            var data = [['login','email','first_name','last_name','disabled', 'external_id']];
            for (var i of list) {
                data.push([i.login, i.email, i.first_name, i.last_name, i.disabled, i.external_id]);
            }

            console.table(data);
        });
    },

    /**
     * Grant a role to a user
     *
     * @param {String} login the login (email) of the user
     * @param {String} role the role to grant
     * @param {String} scope the scope of the role to grant
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    grant : function(login, role, scope, asJson) {
        if (typeof(login) === 'undefined' || login === null) {
            console.error("Missing login. Please pass a login using -l,--login");
            return;
        }
        if (typeof(role) === 'undefined' || role === null) {
            console.error("Missing role. Please pass a role using -r,--role");
            return;
        }
        getUser(login, function(err, user) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            grantRole(user, role, scope, function(err, changedUser) {
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
     */
    revoke : function(login, role, scope, asJson) {
        if (typeof(login) === 'undefined' || login === null) {
            console.error("Missing login. Please pass a login using -l,--login");
            return;
        }
        if (typeof(role) === 'undefined' || role === null) {
            console.error("Missing role. Please pass a role using -r,--role");
            return;
        }
        getUser(login, function(err, user) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }
            revokeRole(user, role, scope, function(err, changedUser) {
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
    }
};