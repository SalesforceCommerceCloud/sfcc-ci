/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var sinon = require('sinon').createSandbox();

var console = require('../../lib/log');

var errorLogStub = sinon.spy(console, 'error');
var warnLogStub = sinon.spy(console, 'warn');
var jsonLogStub = sinon.spy(console, 'json');
var infoLogStub = sinon.spy(console, 'info');
var tableLogStub = sinon.spy(console, 'table');
var prettyPrintLogStub = sinon.spy(console, 'prettyPrint');

exports.errorLogStub = errorLogStub;
exports.warnLogStub = warnLogStub;
exports.infoLogStub = infoLogStub;
exports.jsonLogStub = jsonLogStub;
exports.tableLogStub = tableLogStub;
exports.prettyPrintLogStub = prettyPrintLogStub;