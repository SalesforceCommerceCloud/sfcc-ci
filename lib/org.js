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

const API_BASE = '/dw/rest/v1';
const ORG_ALLOWED_READ_PROPERTIES = [ 'id', 'name', 'realms', 'twoFARoles' ];

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
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the org are available as arguments to the callback function
 */
function getOrg(org, token, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/organizations/search/findByName?startsWith='
        + encodeURIComponent(org) + '&ignoreCase=false', token || auth.getToken(), 'GET');

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
        } else if ( body.content.length === 0 ) {
            callback(new Error(util.format('Unknown org %s', org)));
            return;
        } else if ( body.content.length > 1 ) {
            // attempt to find an exact match
            var filtered = body.content.filter(function(cand) {
                // check on filter criterias
                return ( cand.name === org );
            });
            if ( filtered.length === 1 ) {
                callback(undefined, filterOrg(filtered[0]));
                return;
            }
            // report ambiguousness
            callback(new Error(util.format('Org %s is ambiguous', org)));
            return;
        }
        // do the callback with the body
        callback(undefined, filterOrg(body.content[0]));
    });
}

/**
 * Filters properties of the passed org and returns a reduced object containing only
 * an allowed list of properties.
 *
 * @param {Object} org the original org object
 * @return {Object} the filtered org
 */
function filterOrg(org) {
    for (var prop in org) {
        if (org.hasOwnProperty(prop) && ORG_ALLOWED_READ_PROPERTIES.indexOf(prop) === -1) {
            // delete the property if not allowed to read
            delete org[prop];
        }
    }
    return org;
}

/**
 * Retrieves all orgs and returns them as list.
 *
 * @param {Function} callback the callback to execute, the error and the list of orgs are available as arguments to the callback function
 */
function getOrgs(callback) {

    // build the request options
    var options = getOptions(API_BASE + '/organizations', auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(util.format('Searching orgs failed: %s', err)), []);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Searching orgs failed: %s', res.statusCode)));
            return;
        }
        callback(undefined, body.content);
    });
}

module.exports.getOrg = getOrg;
module.exports.cli = {
    /**
     * Lists all org eligible to manage
     *
     * @param {String} orgId the org id or null, if all orgs should be retrieved
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of users by
     */
    list : function(orgId, asJson, sortBy) {
        // get details of a single org if org was passed
        if ( typeof(orgId) !== 'undefined' && orgId !== null ) {
            getOrg(orgId, undefined, function(err, org) {
                if (err) {
                    console.error(err.message);
                    return;
                }
                if (asJson) {
                    console.json(org);
                    return;
                }

                console.prettyPrint(org);
            });
            return;
        }
        // get all orgs
        getOrgs(function(err, list) {
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
                console.info('No orgs found');
                return;
            }

            // table fields
            var data = [['id', 'name','realms','twoFARoles']];
            for (var i of list) {
                data.push([i.id, i.name, i.realms.length, ( i.twoFARoles.length > 0 )]);
            }

            console.table(data);
        });
    }
};