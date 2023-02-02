/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var request = require('request');

var auth = require('./auth');
var console = require('./log');
var ocapi = require('./ocapi');

function addCartridge(instance, cartridgename, position, target, siteid, verbose, token, callback) {
    var endpoint = `/s/-/dw/data/v19_1/sites/${siteid}/cartridges`;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);
    var body = {
        name: cartridgename,
        position: position
    }
    if (position === 'before' || position === 'after') {
        body.target = target;
    }

    // the patch body
    options['body'] = body;
    if (verbose) {
        // verbose log output
        console.info('Attempting Cartridge Add Request ', options);
    }
    // just do the request and pass the callback
    request.post(options, callback);
}

function add(instance, cartridgename, position, target, siteid, verbose) {
    addCartridge(instance, cartridgename, position, target, siteid, verbose, auth.getToken(), function (err, res) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200 && !res.fault) {
                console.info('Cartridge %s added on %s (%s)',
                    cartridgename, instance, siteid);
            } else if (res && res.body && res.body.fault && res.body.fault.type == 'CartridgeAlreadyExistException') {
                console.warn('Cartridge %s already active on %s',
                    cartridgename, instance);
            } else {
                console.error('Adding Cartridge  %s on %s failed: %s (%s)',
                    cartridgename, instance, res.body.fault.type, res.body.fault.message);
            }
        }, function() {
            add(instance, cartridgename, position, target, siteid, verbose);
        });
    });
}

module.exports.add = add;

module.exports.api = {
    add: addCartridge
}