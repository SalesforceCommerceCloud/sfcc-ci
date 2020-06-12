/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
// make the APIs publicly available
exports.auth = require('./lib/auth').api;
exports.cartridge = require('./lib/cartridge').api;
exports.code = require('./lib/code').api;
exports.instance = require('./lib/instance').api;
exports.job = require('./lib/job').api;
exports.webdav = require('./lib/webdav').api;