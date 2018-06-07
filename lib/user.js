var request = require('request');
var util = require('util');

var auth = require('./auth');
var console = require('./log');

const API_BASE = 'account.demandware.com/dw/rest/v1';
const USER_LIST_PAGE_SIZE = 10;
const USER_ALLOWED_READ_PROPERTIES = [ 'id', 'userState', 'roles', 'roleTenantFilter', 'primaryOrganization', 'mail',
    'firstName', 'lastName', 'displayName' ];

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
 * Contructs the http request options and ensure shared request headers across requests, such as authentication.
 *
 * @param {String} path
 * @param {String} token
 * @param {String} method
 * @return {Object} the request options
 */
function getOptions(path, token, method) {
    var opts = {
        uri: 'https://' + path,
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
 * Retrieves detals of a user.
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
        } else if ( prop === 'roleTenantFilter' ) {
            // transform to object form
            var scopeFilters = {};
            var groups = user[prop].split(';');
            for (var i=0; i<groups.length; i++) {
                var role = groups[i].split(':');
                if (role[0] === '') {
                    continue;
                }
                scopeFilters[role[0]] = null;
                if (typeof(role[1]) !== 'undefined') {
                    scopeFilters[role[0]] = role[1].split(',');
                }
            }
            user[prop] = scopeFilters;
        }
    }
    return user;
}

/**
 * Retrieves all users and returns them as array.
 *
 * @param {Number} page the page index to return the user list for
 * @param {Number} max the max page size of the user list
 * @param {Function} callback the callback to execute, the error and the list of users are available as arguments to the callback function
 */
function getUsers(page, max, callback) {
    // the page index
    var pageIdx = 0;
    if ( page ) {
        pageIdx = Number.parseInt(page);
    }
    // the page size
    var size = USER_LIST_PAGE_SIZE
    if ( max ) {
        size = Number.parseInt(max);
    }

    // build the request options
    var options = getOptions(API_BASE + '/users?page=' + pageIdx + '&size=' + size, auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Getting users failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting users failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, body['content']);
    });
}

module.exports.cli = {
    /**
     * Lists all users eligible to manage
     *
     * @param {Number} page the page index to return the user list for
     * @param {Number} max the max page size of the user list
     * @param {String} login the login or null, if all users should be retrieved
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of users by
     */
    list : function(page, max, login, asJson, sortBy) {
        // get details of a single user if login was passed
        if ( typeof(login) !== 'undefined' && login !== null ) {
            getUser(login, function(err, user) {
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
        getUsers(page, max, function(err, list) {
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
                console.info('No users found');
                return;
            }

            // table fields
            var data = [['id','mail','firstName','lastName','userState']];
            for (var i of list) {
                data.push([i.id, i.mail, i.firstName, i.lastName, i.userState]);
            }

            console.table(data);
        });
    }
};