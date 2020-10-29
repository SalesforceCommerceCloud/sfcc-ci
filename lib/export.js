/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var fs = require('fs');

/** 
Check to see if user specified data is set. If not it will trigger !data.
If it is there a check if what a specified has a file path that exists.
If file exists it reads the data
If file doesn't exist it will try to parse the value of user input as JSON 

*/
module.exports.readExportJson = function readExportJson(exportJson) {
    if (exportJson == undefined) {
        return
    }
    else if (fs.existsSync(exportJson)) {
        var rawdata = fs.readFileSync(exportJson);
    }
    else {
        var rawdata = exportJson;
    }
    var exportData = JSON.parse(rawdata);
    return exportData;
}
