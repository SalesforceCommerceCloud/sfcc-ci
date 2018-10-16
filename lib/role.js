var request = require('request');
var util = require('util');

var auth = require('./auth');
var console = require('./log');
var ocapi = require('./ocapi');

const ROLE_ALLOWED_READ_PROPERTIES = [ 'id', 'description', 'user_count', 'user_manager', 'users' ];
const USER_ALLOWED_READ_PROPERTIES = [ 'disabled', 'email', 'first_name', 'last_name', 'login' ];

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
    }
    // just return the error, in case no callback is passed
    if (!callback) {
        return error;
    }
    callback(error, response);
}

/**
 * Retrieves detals of a role
 *
 * @param {String} instance the instance to get the role from
 * @param {String} role the role to get details for
 * @param {Function} callback the callback to execute, the error and the role are available as arguments to the callback function
 */
function getRole(instance, role, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/roles/' + role + '?select=(**)&expand=users'

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        // TODO
        //var errback = captureCommonErrors(err, res);
        //if ( errback ) {
        //    callback(errback);
        //    return;
        //} else if ( res.statusCode === 404 ) {
        if ( err ) {
            callback(new Error(util.format('Getting role failed: %s', err)));
            return;
        } else if ( res.statusCode === 404 ) {
            callback(new Error(util.format('Role %s not found', role)));
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting role failed: %s', res.statusCode)));
            return;
        }

        // do the callback with the body
        callback(undefined, filterRole(body));
    });
}

/**
 * Retrieves roles from an instance (will only return the first 25 roles)
 *
 * @param {Number} instance the instance to list roles for
 * @param {Function} callback the callback to execute, the error and the list of role are available as arguments to the callback function
 */
function getRoles(instance, callback) {
    // build the request options
    // the page size (default on server is 25)
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/roles?select=(**)'

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        // TODO
        //var errback = captureCommonErrors(err, res);
        //if ( errback ) {
        //    callback(errback, []);
        //    return;
        //} else if ( err ) {
        if ( err ) {
            callback(new Error(util.format('Getting roles failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting roles failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, body['data'].map(filterRole));
    });
}

/**
 * Filters properties of the passed role object and returns a reduced object containing only
 * an allowed list of properties.
 *
 * @param {Object} role the original role object
 * @return {Object} the filtered role
 */
function filterRole(role) {
    for (var prop in role) {
        if (role.hasOwnProperty(prop) && ROLE_ALLOWED_READ_PROPERTIES.indexOf(prop) === -1) {
            // delete the property if not allowed to read
            delete role[prop];
        } else if (role.hasOwnProperty(prop) && prop === 'users') {
            role[prop] = role[prop].map(filterUser);
        }
    }
    return role;
}

/**
 * Filters properties of the passed user object and returns a reduced object containing only
 * an allowed list of properties.
 *
 * @param {Object} user the original user object
 * @return {Object} the filtered role
 */
function filterUser(user) {
    for (var prop in user) {
        if (user.hasOwnProperty(prop) && USER_ALLOWED_READ_PROPERTIES.indexOf(prop) === -1) {
            // delete the property if not allowed to read
            delete user[prop];
        }
    }
    return user;
}

module.exports.filterUser = filterUser;
module.exports.cli = {
    /**
     * Lists all roles
     *
     * @param {String} instance the instance to list roles for
     * @param {String} role the role to get details for (optional)
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of roles by
     */
    list : function(instance, role, asJson, sortBy) {
        // get details of a single user if login was passed
        if ( typeof(role) !== 'undefined' && role !== null ) {
            getRole(instance, role, function(err, role) {
                if (err) {
                    console.error(err.message);
                    return;
                }
                if (asJson) {
                    console.json(role);
                    return;
                }

                console.prettyPrint(role);
            });
            return;
        }
        // get all roles
        getRoles(instance, function(err, list) {
            if (err) {
                console.error(err.message);
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
                console.info('No roles found');
                return;
            }

            // table fields
            var data = [['id','user_count','user_manager']];
            for (var i of list) {
                data.push([i.id, i.user_count, i.user_manager]);
            }

            console.table(data);
        });
    }
};