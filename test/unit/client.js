/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var chai = require('chai');
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().preserveCache();

var expect = chai.expect;

// stub of the request library
var requestStub = sinon.spy();

describe('Tests for lib/client.js', function() {

    var client = proxyquire('../../lib/client', {
        'request': requestStub,
        './auth': {
            'getToken' : () => 'mytoken',
            'getAMHost' : () => 'am.host'
        }
    });

    describe('trimClientID function', function() {

        it('trims leaving only 7 characters', function() {
            var clientId = '1234abcd-5678-efab-9012-3456cdef7890'
            expect(client.trimClientID(clientId)).to.equal('1234abc');
        });
    });
});