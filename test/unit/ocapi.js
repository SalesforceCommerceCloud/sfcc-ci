/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var chai = require('chai');
var sinon = require('sinon');
const proxyquire = require('proxyquire');

var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();

describe('Tests for lib/ocapi.js', function() {

    const requestStub = sinon.stub(), // b/c retryableCall() uses request() directly
        authStubs = {},
        ocapi = proxyquire('../../lib/ocapi', {
            'request': requestStub,
            './auth': authStubs // initially pass-through
        });

    const config = require('../../lib/config').obtain();

    describe('getOptions function', function() {

        it('should return an object with required keys', function() {
            var options = require('../../lib/ocapi').getOptions([]);
            expect(options).to.be.an('object').to.have.all.keys('uri', 'auth', 'strictSSL', 'method', 'json');
            expect(options).to.have.property('strictSSL', true);
            expect(options).to.have.property('json', true);
        });

        it('supports two argument call style', function() {
            const options = ocapi.getOptions('GET', 'http://localhost/my/path');

            expect(options).to.be.an('object').to.have.all.keys('uri', 'auth', 'strictSSL', 'method', 'json');
            expect(options).to.have.property('strictSSL', true);
            expect(options).to.have.property('json', true);
        });
    });

    describe('#retryableCall', () => {
        const currentAccessToken = 'abc',
            newAccessToken = 'cde',
            newRefreshToken = '123',
            authFailureResponse1 = { body: { fault: { type: 'InvalidAccessTokenException'} } },
            authFailureResponse2 = { body: { error: 'invalid_token', error_description: currentAccessToken } },
            authSuccessResponse = { statusCode: 200,
                body: {
                    refresh_token: newRefreshToken,
                    access_token: newAccessToken
                }
            };

        beforeEach(function () {
            requestStub.resetHistory();

            config.set('SFCC_CLIENT_TOKEN', currentAccessToken);
        });

        it('constructs own options', () => {
            ocapi.retryableCall('GET', 'https://localhost/my/path', () => {});

            sinon.assert.calledOnce(requestStub);
            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs).to.haveOwnProperty('auth');
        });

        it('always sends an auth header', () => {
            const options = ocapi.getOptions('GET', 'https://localhost/my/path');
            delete options.auth;

            ocapi.retryableCall('GET', options, () => {});

            sinon.assert.calledOnce(requestStub);
            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs).to.haveOwnProperty('auth');
        });

        it('retries call when encountering invalid token response', () => {
            requestStub.yields(null, authFailureResponse1);
            authStubs.renew = function(callback) {
                requestStub.yields(null, authSuccessResponse); // simulate successful renewal
                callback();
            };

            ocapi.retryableCall('GET', 'https://localhost/my/path', () => {});

            sinon.assert.calledTwice(requestStub);
        });
    });
});