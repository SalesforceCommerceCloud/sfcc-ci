/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var chai = require('chai');
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();

// stub of the request library with post function mocked out
var requestStub = {
    post: sinon.spy(),
};

// mock of dwjson config object
var dwjsonMock = {};

describe('Tests for lib/auth.js', function() {

    const clientKey = 'ABCD-1234-EFGH',
        clientSecret = 'FooBar!!',
        clientKey2 = '7777-8888-9999',
        clientSecret2 = 'BizBazBuzzz',
        user = 'test-user@test.com',
        password = 'abc123',
        AMURI1 = 'account-pod5.demandware.net',
        AMURI2 = 'account-pod99.demandware.edu';

    var auth = proxyquire('../../lib/auth', {
        'request': requestStub,
        './dwjson': {
            init : () => dwjsonMock,
        },
        './secrets': {
            getClientID : () => clientKey2,
            getClientSecret : () => clientSecret2
        }
    });
    var config = require('../../lib/config').obtain();

    describe('cli.logout function', function() {

        it('should call config.delete on relevant configuration keys', function() {
            var deleteSpy = sinon.spy(config, 'delete');

            auth.cli.logout();

            sinon.assert.calledWith(deleteSpy, 'SFCC_CLIENT_ID');
            sinon.assert.calledWith(deleteSpy, 'SFCC_CLIENT_TOKEN');
            deleteSpy.restore();
        });
    });

    describe('getAutoRenewBase64 function', function() {

        it('should call config.get on relevant configuration key', function() {
            var spy = sinon.spy(config, 'get');

            auth.getAutoRenewBase64();

            sinon.assert.calledWith(spy, 'SFCC_CLIENT_RENEW_BASE');
            spy.restore();
        });
    });

    describe('getClient function', function() {

        it('should call config.get on relevant configuration key', function() {
            var spy = sinon.spy(config, 'get');

            auth.getClient();

            sinon.assert.calledWith(spy, 'SFCC_CLIENT_ID');
            spy.restore();
        });
    });

    describe('getToken function', function() {

        it('should call config.get on relevant configuration key', function() {
            var spy = sinon.spy(config, 'get');

            auth.getToken();

            sinon.assert.calledWith(spy, 'SFCC_CLIENT_TOKEN');
            spy.restore();
        });
    });

    describe('auth function', function() {
        describe('building request to obtain token', function() {
            beforeEach(function() {
                requestStub.post.resetHistory();
            });

            it('makes a client-credentials request', function() {
                auth.auth(clientKey, clientSecret);
                const postArgs = requestStub.post.getCall(0).args[0];
                expect(postArgs.form.grant_type).to.equal('client_credentials');
                expect(postArgs.uri).to.equal('https://account.demandware.com/dw/oauth2/access_token');
                expect(postArgs.json).to.be.true;
                expect(postArgs.auth.user).to.equal(clientKey);
                expect(postArgs.auth.pass).to.equal(clientSecret);
            });

            it('changes to a password request when user/password are provided', function() {
                auth.auth(clientKey, clientSecret, user, password);
                const postArgs = requestStub.post.getCall(0).args[0];
                expect(postArgs.form.grant_type).to.equal('password');
                expect(postArgs.form.username).to.equal(user);
                expect(postArgs.form.password).to.equal(password);
            });

            it('accepts an alternate account manager URI', function() {
                const accountManager = AMURI1;
                auth.auth(clientKey, clientSecret, null, null, false, accountManager);
                const postArgs = requestStub.post.getCall(0).args[0];
                expect(postArgs.uri).to.equal('https://account-pod5.demandware.net/dw/oauth2/access_token');
            });

            it('will look up client/secret from secrets if needed', function() {
                auth.auth();
                const postArgs = requestStub.post.getCall(0).args[0];
                expect(postArgs.form.grant_type).to.equal('client_credentials');
                expect(postArgs.auth.user).to.equal(clientKey2);
                expect(postArgs.auth.pass).to.equal(clientSecret2);
            });

            it('will use account manager URI from dwjson if one exists', function() {
                dwjsonMock['account-manager'] = AMURI2;
                auth.auth();
                const postArgs = requestStub.post.getCall(0).args[0];
                expect(postArgs.uri).to.equal('https://account-pod99.demandware.edu/dw/oauth2/access_token');
            });

            it('will use accountManager function arg over dwjson config value', function() {
                const accountManager = AMURI1;
                dwjsonMock['account-manager'] = AMURI2;
                auth.auth(clientKey, clientSecret, null, null, false, accountManager);
                const postArgs = requestStub.post.getCall(0).args[0];
                expect(postArgs.uri).to.equal('https://account-pod5.demandware.net/dw/oauth2/access_token');
            });
        });
    });

    describe('#renew', function() {
        const refreshToken = 'abc',
            newRefreshToken = 'cde',
            currentAccessToken = 'aaa3057e-11e9-4bc6-af0c-71eafb30ca9d',
            newAccessToken = 'zzz3057e-11e9-4bc6-af0c-71eafb30ca9d',
            credentials = Buffer.from(clientKey + ':' + clientSecret).toString('base64'),
            successResponse = {statusCode: 200,
                body: {
                    refresh_token: newRefreshToken,
                    access_token: newAccessToken
                }
            },
            failureResponse = {statusCode: 403, body: {error: ''}},
            callback = sinon.spy();

        beforeEach(function() {
            requestStub.post.resetHistory();
            callback.resetHistory();

            config.set('SFCC_CLIENT_RENEW_BASE', credentials);
            config.set('SFCC_CLIENT_ID', clientKey);
            config.set('SFCC_CLIENT_TOKEN', currentAccessToken);
            config.set('SFCC_REFRESH_TOKEN', refreshToken);
        });

        it('no refresh token results in client_credentials auth', function() {
            config.set('SFCC_REFRESH_TOKEN', null);

            auth.renew(callback);

            sinon.assert.calledOnce(requestStub.post);

            const postArgs = requestStub.post.getCall(0).args[0];
            expect(postArgs.form.grant_type).to.equal('client_credentials');
        });

        it('makes call to AM with stored credentials', function() {
            auth.renew(callback);

            sinon.assert.calledOnce(requestStub.post);

            const postArgs = requestStub.post.getCall(0).args[0];
            expect(postArgs.form.grant_type).to.equal('refresh_token');
            expect(postArgs.form.refresh_token).to.equal(refreshToken);
            expect(postArgs.auth.user).to.equal(clientKey);
            expect(postArgs.auth.pass).to.equal(clientSecret);
        });

        it('updates auth tokens', function() {
            requestStub.post = sinon.stub().yields(null, successResponse);
            auth.renew(callback);

            expect(config.get('SFCC_CLIENT_TOKEN')).to.equal(newAccessToken);
            expect(config.get('SFCC_REFRESH_TOKEN')).to.equal(newRefreshToken);
        });

        it('executes callback on successful call', function() {
            requestStub.post = sinon.stub().yields(null, successResponse);
            auth.renew(callback);

            sinon.assert.calledOnce(callback);
        });

        it('ignores callback on failure call', function() {
            requestStub.post = sinon.stub().yields(null, failureResponse);
            auth.renew(callback);

            sinon.assert.notCalled(callback);
        });
    })

    after(function () {
        sinon.restore();
    });

});
