/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var Conf = require('conf');

// create a Conf instance
var conf = new Conf({
    projectName: 'sfcc-ci'
});

// return an instance of Configstore
module.exports.obtain = function() {
    return conf;
};
