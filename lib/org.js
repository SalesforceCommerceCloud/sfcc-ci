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
const ORG_LIST_MAX_PAGE_SIZE = 5000;
const ORG_LIST_PAGE_SIZE = 25;

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
    } else if ( response.statusCode > 400 ) {
        return new Error(`Operation failed. Error code ${response.statusCode}`);
    }
    return null;
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
        var error = captureCommonErrors(err, res);
        if ( error ) {
            callback(error, []);
            return;
        } else if ( body.content.length === 0 ) {
            callback(new Error(`Unknown org ${org}`));
            return;
        } else if ( body.content.length > 1 ) {
            // attempt to find an exact match
            var filtered = body.content.filter(function(cand) {
                // check on filter criterias
                return ( cand.name === org );
            });
            if ( filtered.length === 1 ) {
                callback(undefined, toExternalOrg(filtered[0]));
                return;
            }
            // report ambiguousness
            callback(new Error(`Org ${org} is ambiguous`));
            return;
        }
        // do the callback with the body
        callback(undefined, toExternalOrg(body.content[0]));
    });
}

/**
 * Retrieves audit logs for an org
 *
 * @param {String} user the org
 * @param {String} token oauth token
 * @param {Function} callback the callback to execute, the error and the audit log are available as arguments to the callback function
 */
function getOrgAuditLogs(org, token, callback) {
    // build the request options
    var options = getOptions(API_BASE + '/organizations/' + org.id + '/audit-log-records',
        token || auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var errback = captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback);
            return;
        } else if ( res.statusCode >= 400 ) {
            callback(new Error(util.format('Getting audit logs failed: %s', res.statusCode)));
            return;
        } else if ( err ) {
            callback(new Error(util.format('Getting audit logs failed: %s', err)));
            return;
        }

        // do the callback with the body
        callback(undefined, body, body.content);
    });
}

/**
 * Transforms the API org representation to an external format. Certain properties are
 * transformed into an object representation.
 *
 * @param {Object} org the original org object
 * @return {Object} the transformed org object
 */
function toExternalOrg(org) {
    // always delete some properties
    delete org['links'];

    return org;
}

/**
 * Retrieves all orgs and returns them as list.
 *
 * @param {Number} count the max count of items in the list
 * @param {Boolean} all whether to return all orgs eligible to manage
 * @param {Function} callback the callback to execute, the error and the list of orgs are available as arguments to the callback function
 */
function getOrgs(count, all, callback) {
    // the page size
    var size = ORG_LIST_PAGE_SIZE
    if ( all ) {
        size = ORG_LIST_MAX_PAGE_SIZE;
    } else if ( count ) {
        size = Number.parseInt(count);
    }

    // build the request options
    var options = getOptions(API_BASE + '/organizations?page=0&size=' + size, auth.getToken(), 'GET');

    // do the request
    request(options, function (err, res, body) {
        var error = captureCommonErrors(err, res);
        if ( error ) {
            callback(error, []);
            return;
        }
        callback(undefined, body.content);
    });
}

/**
 * Determines an org based on ID.
 *
 * @param {String} orgId
 * @return {Promise}
 */
async function getOrgById(orgId) {
    // build the request options
    var options = getOptions(API_BASE + '/organizations/' + orgId, auth.getToken(), 'GET');

    // do request
    return new Promise(function(resolve, reject) {
        request(options, function (err, res, body) {
            var error = captureCommonErrors(err, res);
            if ( error ) {
                reject(error);
                return;
            }
            resolve(body);
        });
    });
}

module.exports.getOrg = getOrg;
module.exports.getOrgById = getOrgById;
module.exports.getOrgs = getOrgs;
module.exports.cli = {
    /**
     * Lists all org eligible to manage
     *
     * @param {String} orgId the org id or null, if all orgs should be retrieved
     * @param {Boolean} auditlogs optional flag to return audit logs for an org, false by default
     * @param {Number} count the max count of list items
     * @param {Boolean} all whether to return all orgs, false by default
     * @param {Boolean} asJson optional flag to force output in json, false by default
     * @param {String} sortBy optional field to sort the list of orgs by
     */
    list : function(orgId, auditlogs, count, all, asJson, sortBy) {
        // get details of a single org if org was passed
        if ( typeof(orgId) !== 'undefined' && orgId !== null ) {
            // get audit logs
            // define the callback
            var getAuditLogsCallback = function(err, result, list) {
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
                    console.info('No audit records found');
                    return;
                }

                // table fields
                var data = [['timestamp','authorDisplayName', 'authorEmail','eventType','eventMessage']];
                for (var i of list) {
                    data.push([i.timestamp, i.authorDisplayName, ( i.authorEmail ? i.authorEmail : 'n/a' ),
                        i.eventType, i.eventMessage]);
                }

                console.table(data, {
                    columns : {
                        4 : { width : 100 }
                    }
                });
            };

            // in case org audit logs are requested, resolve org id first
            if ( auditlogs ) {
                getOrg(orgId, undefined, function(err, org) {
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
                    getOrgAuditLogs(org, undefined, getAuditLogsCallback);
                });
                return;
            }
            // just return org details
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
        // get list of orgs
        getOrgs(count, all, function(err, list) {
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
            var data = [['id', 'name','realms','twoFARoles','twoFAEnabled','allowedVerifierTypes','vaasEnabled',
                'sfIdentityFederation']];
            for (var i of list) {
                var org = toExternalOrg(i);
                data.push([org.id, org.name, org.realms.length, org.twoFARoles.length, org.twoFAEnabled,
                    org.allowedVerifierTypes.length, org.vaasEnabled, org.sfIdentityFederation]);
            }

            console.table(data);
        });
    }
};