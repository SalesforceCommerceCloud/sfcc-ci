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

// stub of the log library
var testbase = require('./_base');
var jsonStub = testbase.jsonLogStub;
var infoStub = testbase.infoLogStub;

describe('Tests for lib/user.js', function() {

    var user = proxyquire('../../lib/user', {
        'request': requestStub,
        './auth': {
            'getToken' : () => 'mytoken',
            'getAMHost' : () => 'am.host'
        },
        './org': {
            'getOrg' : function (id, undefined, callback) {
                callback(undefined, { id : 'myorg' });
            }
        }
    });

    var internalUserObj = {
        firstName : 'John',
        lastName : 'Doe',
        displayName : 'John Doe',
        userState : 'ok',
        roles : ['admin','expert','ECOM_ADMIN','ECOM_USER'],
        roleTenantFilter : 'expert:here,there;ECOM_ADMIN:zzzz_stg;ECOM_USER:zzzz_prd',
        primaryOrganization : 'doe org',
        mail : 'john@doe.org',
        organizations : ['doe org','other org'],
        unsupported : 'foo',
        hobby : 'coding'
    };
    var cleanUserObj = {
        firstName : 'John',
        lastName : 'Doe',
        displayName : 'John Doe',
        userState : 'ok',
        roles : ['admin','expert','ECOM_ADMIN','ECOM_USER'],
        roleTenantFilter : {expert : ['here', 'there'],'bm-admin':['zzzz_stg'],'bm-user':['zzzz_prd']},
        primaryOrganization : 'doe org',
        mail : 'john@doe.org',
        organizations : ['doe org','other org']
    };

    var localUserObj = {
        first_name : 'John',
        last_name : 'Doe'
    };

    describe('cli.create function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
            jsonStub.resetHistory();
        });

        it('makes a post request', function() {
            user.cli.create('myorg', undefined, 'john@doe.org', 'John', 'Doe', true);

            const reqArgs = requestStub.getCall(0).args[0];
            expect(reqArgs.uri).to.equal('https://am.host/dw/rest/v1/users');
            expect(reqArgs.method).to.equal('POST');
        });

        it('returns the created user', function() {
            var user = proxyquire('../../lib/user', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, internalUserObj);
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'json' : jsonStub
                },
                './org': {
                    'getOrg' : function (id, undefined, callback) {
                        callback(undefined, { id : 'myorg' });
                    }
                }
            });
            user.cli.create('myorg', undefined, 'john@doe.org', 'John', 'Doe', true);

            const logArgs = jsonStub.getCall(0).args;
            expect(logArgs[0]).to.eql(cleanUserObj);
        });
    });

    describe('cli.list function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
            jsonStub.resetHistory();
        });

        it('makes a get request ...', function() {
            var user = proxyquire('../../lib/user', {
                'request': requestStub,
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'json' : jsonStub
                },
                './org': {
                    'getOrg' : function (id, undefined, callback) {
                        callback(undefined, { id : 'myorg' });
                    }
                }
            });
            user.cli.list('myorg', null, null, null, true, undefined);

            const reqArgs = requestStub.getCall(0).args[0];
            expect(reqArgs.uri).to.equal('https://am.host/dw/rest/v1/users?page=0&size=25');
            expect(reqArgs.method).to.equal('GET');
        });

        it('returns multiple users', function() {
            var user = proxyquire('../../lib/user', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, [{id:1,firstName:'John'},{id:2,firstName:'Jane'}]);
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'json' : jsonStub
                },
                './org': {
                    'getOrg' : function (id, undefined, callback) {
                        callback(undefined, { id : 'myorg' });
                    }
                }
            });
            user.cli.list('myorg', null, null, null, true, undefined);

            const logArgs = jsonStub.getCall(0).args;
            expect(logArgs[0]).to.eql([{id:1,firstName:'John'},{id:2,firstName:'Jane'}]);
        });

        it('returns a single user', function() {
            var user = proxyquire('../../lib/user', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {id:1,firstName:'John'});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'json' : jsonStub
                },
                './org': {
                    'getOrg' : function (id, undefined, callback) {
                        callback(undefined, { id : 'myorg' });
                    }
                }
            });
            user.cli.list('myorg', null, 'john@doe.org', null, true, undefined);

            const logArgs = jsonStub.getCall(0).args;
            expect(logArgs[0]).to.eql({id:1,firstName:'John'});
        });
    });

    describe('cli.createLocal function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
            jsonStub.resetHistory();
        });

        it('makes a PUT request', function() {
            user.cli.createLocal('my.instance', 'john@doe.org', localUserObj, true);

            const reqArgs = requestStub.getCall(0).args[0];
            expect(reqArgs.uri).to.equal('https://my.instance/s/-/dw/data/v19_5/users/john@doe.org');
            expect(reqArgs.method).to.equal('PUT');
        });

        it('returns the created user', function() {
            var user = proxyquire('../../lib/user', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, localUserObj);
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'json' : jsonStub
                },
                './org': {
                    'getOrg' : function (id, undefined, callback) {
                        callback(undefined, { id : 'myorg' });
                    }
                }
            });
            user.cli.createLocal('my.instance', 'john@doe.org', localUserObj, true);

            const logArgs = jsonStub.getCall(0).args;
            expect(logArgs[0]).to.eql(localUserObj);
        });
    });
});