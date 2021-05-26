/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var fs = require('fs');

module.exports.readExportJson = function readExportJson(exportJson = '') {
    if (!exportJson) return;
    var rawdata = fs.existsSync(exportJson) ? fs.readFileSync(exportJson) : exportJson;
    return JSON.parse(rawdata)
}