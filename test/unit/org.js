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

describe('Tests for lib/org.js', function() {

    var org = proxyquire('../../lib/org', {
        'request': requestStub,
        './auth': {
            'getToken' : () => 'mytoken',
            'getAMHost' : () => 'am.host'
        }
    });

    describe('getOrg function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
        });

        it('makes a get request', function() {

            org.getOrg('myorg', undefined, function(){});

            const getArgs = requestStub.getCall(0).args[0];
            expect(getArgs.uri).to.equal('https://am.host/dw/rest/v1/organizations/search/findByName' +
                '?startsWith=myorg&ignoreCase=false');
            expect(getArgs.method).to.equal('GET');
        });

        it('handles arbitrary error', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback('someerror', undefined, undefined);
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found) {
                expect(err.message).to.equal('The operation could not be performed properly. ');
                done();
            });
        });

        it('handles 401 error', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback('error', {statusCode: 401}, undefined);
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found) {
                expect(err.message).to.equal('Authentication invalid. Please (re-)authenticate by running ' +
                    '´sfcc-ci auth:login´ or ´sfcc-ci client:auth´');
                done();
            });
        });

        it('handles 403 error', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback('Permission error', {statusCode: 403}, undefined);
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found) {
                expect(err.message).to.equal('Getting org failed: Permission error');
                done();
            });
        });

        it('handles other 4xx or 5xx errors', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 500}, undefined);
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found) {
                expect(err.message).to.equal('Getting org failed: 500');
                done();
            });
        });

        it('properly processes a none found org', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found) {
                expect(err.message).to.equal('Unknown org myorg');
                expect(found).to.be.undefined;
                done();
            });
        });

        it('properly handles multiple found orgs', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[{id:1,name:"org a"},{id:2,name:"org b"}]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found) {
                expect(err.message).to.equal('Org myorg is ambiguous');
                expect(found).to.be.undefined;
                done();
            });
        });

        it('properly matches org from multiple candidate orgs', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[{id:1,name:"myorg"},{id:2,name:"myorg b"}]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found) {
                expect(err).to.be.undefined;
                expect(found).to.eql({ id: 1, name: 'myorg' });
                done();
            });
        });

        it('properly processes an exact match', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[{id:1,name:"myorg"}]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found){
                expect(err).to.be.undefined;
                expect(found).to.eql({ id: 1, name: 'myorg' });
                done();
            });
        });

        it('properly filters internal properties', function(done) {
            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[{id:1,name:"myorg",internal:'yes'}]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                }
            });

            org.getOrg('myorg', undefined, function(err, found){
                expect(err).to.be.undefined;
                expect(found).to.eql({ id: 1, name: 'myorg' });
                done();
            });
        });
    });

    describe('cli.list function', function() {
        beforeEach(function() {
            requestStub.resetHistory();
            jsonStub.resetHistory();
            infoStub.resetHistory();
        });

        it('prints no orgs found', function() {

            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'info' : infoStub
                }
            });
            org.cli.list(null, false, undefined);

            const logArgs = infoStub.getCall(0).args;
            expect(logArgs[0]).to.equal('No orgs found');
        });

        it('prints a list of orgs', function() {

            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[{id:1,name:"org a",realms:[],twoFARoles:[]},
                        {id:2,name:"org b",realms:[],twoFARoles:[]}]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'json' : jsonStub
                }
            });
            org.cli.list(null, true, 'id');

            const logArgs = jsonStub.getCall(0).args;
            expect(logArgs[0]).to.eql([{id:1,name:"org a",realms:[],twoFARoles:[]},
                {id:2,name:"org b",realms:[],twoFARoles:[]}]);
        });

        it('prints org details', function() {

            var org = proxyquire('../../lib/org', {
                'request': function (opts, callback) {
                    callback(undefined, {statusCode: 200}, {content:[{id:1,name:"myorg"}]});
                },
                './auth': {
                    'getToken' : () => 'mytoken',
                    'getAMHost' : () => 'am.host'
                },
                './log': {
                    'json' : jsonStub
                }
            });
            org.cli.list('myorg', true, undefined);

            const logArgs = jsonStub.getCall(0).args;
            expect(logArgs[0]).to.eql({id:1,name:"myorg"});
        });
    });
});