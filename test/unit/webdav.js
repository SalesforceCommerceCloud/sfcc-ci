/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var chai = require('chai');
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
//var proxyquire = require('proxyquire');

var expect = chai.expect;

// stub of the request library
var requestStub = sinon.spy();

// stub of the log library
var testbase = require('./_base');
var errorStub = testbase.errorLogStub;
var warnStub = testbase.warnLogStub;
var infoStub = testbase.infoLogStub;

describe('Tests for lib/webdav.js', function() {

    var webdav = proxyquire('../../lib/webdav', {
        'request': requestStub,
        'fs' : {
            'existsSync' :  () => true,
            'statSync' : function () {
                return {
                    'isFile' : () => true
                }
            },
            'createReadStream' : function () {
                return {
                    'pipe' : function() {}
                }
            }
        },
        './auth': {
            'getToken' : () => 'mytoken'
        },
        './ocapi': {
            'ensureValidToken' : function (err, res, callback1, callback2) {
                callback1();
            }
        }
    });

    describe('cli.upload function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
            errorStub.resetHistory();
            warnStub.resetHistory();
            infoStub.resetHistory();
        });

        it('should error out if file does not exist', function(){

            var webdav = proxyquire('../../lib/webdav', {
                'fs' : {
                    'existsSync' :  () => false,
                    'statSync' : function () {
                        return {
                            'isFile' : () => false
                        }
                    }
                }
            });

            webdav.cli.upload('instance', 'any/path', 'file.xml', true, {});

            const errorArgs = errorStub.getCall(0).args;
            expect(errorArgs[0]).to.equal('File "%s" does not exist');
            expect(errorArgs[1]).to.equal('file.xml');
        });

        it('should log error if file is not a file', function(){
            var webdav = proxyquire('../../lib/webdav', {
                'fs' : {
                    'existsSync' :  () => true,
                    'statSync' : function () {
                        return {
                            'isFile' : () => false
                        }
                    }
                }
            });
            webdav.cli.upload('instance', 'any/path', 'folder', true, {});

            const errorArgs = errorStub.getCall(0).args;
            expect(errorArgs[0]).to.equal('File "%s" does not exist or is not a file');
            expect(errorArgs[1]).to.equal('folder');
        });

        it('makes a put request', function(){
            webdav.cli.upload('instance', '/any/path', 'file.xml', true, {});

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.baseUrl).to.equal('https://instance');
            expect(postArgs.uri).to.equal('/on/demandware.servlet/webdav/Sites/any/path/file.xml');
            expect(postArgs.method).to.equal('PUT');
        });

        it('makes a put request using dw.json with self-signed', function(){
            var webdav = proxyquire('../../lib/webdav', {
                'request': requestStub,
                'fs' : {
                    'existsSync' :  () => true,
                    'statSync' : function () {
                        return {
                            'isFile' : () => true
                        }
                    },
                    'createReadStream' : function () {
                        return {
                            'pipe' : function() {}
                        }
                    }
                },
                './auth': {
                    'getToken' : () => 'mytoken'
                },
                './ocapi': {
                    'ensureValidToken' : function (err, res, callback1, callback2) {}
                },
                './dwjson': {
                    'init': function() {
                        return {
                            'self-signed': true
                        }
                    }
                }
            });
            webdav.cli.upload('instance', '/any/path', 'file.xml', true, {});

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.baseUrl).to.equal('https://instance');
            expect(postArgs.uri).to.equal('/on/demandware.servlet/webdav/Sites/any/path/file.xml');
            expect(postArgs.method).to.equal('PUT');

            const warnArgs = warnStub.getCall(0).args;
            expect(warnArgs[0]).to.equal('Allow self-signed certificates. Be caucious as this may expose ' +
                'secure information to an untrusted party.');
        });

        it('allows to account for local file path', function(){
            webdav.cli.upload('instance', '/any/path', 'file.xml', false, {});

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.baseUrl).to.equal('https://instance');
            expect(postArgs.uri).to.equal('/on/demandware.servlet/webdav/Sites/any/path/file.xml');
            expect(postArgs.method).to.equal('PUT');
        });

        it('fails gracefully upon a 401', function(){
            var webdav = proxyquire('../../lib/webdav', {
                'request': function(opt, fn) {
                    return {
                        fn : fn
                    }
                },
                'fs' : {
                    'existsSync' :  () => true,
                    'statSync' : function () {
                        return {
                            'isFile' : () => true
                        }
                    },
                    'createReadStream' : function () {
                        return {
                            'pipe' : function(req) {
                                req.fn();
                            }
                        }
                    }
                },
                './auth': {
                    'getToken' : () => 'mytoken'
                },
                './ocapi': {
                    'ensureValidToken' : function (err, res, callback1, callback2) {
                        callback1(err, { statusCode : 401 });
                    }
                }
            });
            webdav.cli.upload('instance', '/any/path', 'file.xml', true, {});

            const errorArgs = errorStub.getCall(0).args;
            expect(errorArgs[0]).to.equal('Upload file %s to %s failed: %s (%s)');
            expect(errorArgs[3]).to.equal(401);
        });

        it('fails gracefully upon unknown response', function(){
            var webdav = proxyquire('../../lib/webdav', {
                'request': function(opt, fn) {
                    return {
                        fn : fn
                    }
                },
                'fs' : {
                    'existsSync' :  () => true,
                    'statSync' : function () {
                        return {
                            'isFile' : () => true
                        }
                    },
                    'createReadStream' : function () {
                        return {
                            'pipe' : function(req) {
                                req.fn();
                            }
                        }
                    }
                },
                './auth': {
                    'getToken' : () => 'mytoken'
                },
                './ocapi': {
                    'ensureValidToken' : function (err, res, callback1, callback2) {
                        callback1('unexpected error', null);
                    }
                }
            });
            webdav.cli.upload('instance', '/any/path', 'file.xml', true, {});

            const errorArgs = errorStub.getCall(0).args;
            expect(errorArgs[0]).to.equal('Upload file %s failed: %s');
            expect(errorArgs[2]).to.equal('unexpected error');
        });

        it('returns success info when server responds with 200', function(){
            var webdav = proxyquire('../../lib/webdav', {
                'request': function(opt, fn) {
                    return {
                        fn : fn
                    }
                },
                'fs' : {
                    'existsSync' :  () => true,
                    'statSync' : function () {
                        return {
                            'isFile' : () => true
                        }
                    },
                    'createReadStream' : function () {
                        return {
                            'pipe' : function(req) {
                                req.fn();
                            }
                        }
                    }
                },
                './auth': {
                    'getToken' : () => 'mytoken'
                },
                './ocapi': {
                    'ensureValidToken' : function (err, res, callback1, callback2) {
                        callback1(null, { statusCode : 200});
                    }
                }
            });
            webdav.cli.upload('instance', '/any/path', 'file.xml', true, {});

            const infoArgs = infoStub.getCall(0).args;
            expect(infoArgs[0]).to.equal('Instance import file %s uploaded to %s');
        });
    });

    describe('postFile function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
        });

        it('makes a put request', function(){
            webdav.postFile('instance', '/cartridges', 'mycode.zip', 'mytoken', true, {}, function(){});

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.baseUrl).to.equal('https://instance');
            expect(postArgs.uri).to.equal('/on/demandware.servlet/webdav/Sites/cartridges/mycode.zip');
            expect(postArgs.method).to.equal('PUT');
        });
    });

    describe('unzip function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
        });

        it('makes a post request with form method unzip', function(){
            webdav.unzip('instance', '/cartridges', 'mycode.zip', 'mytoken', true, {}, function(){});

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.baseUrl).to.equal('https://instance');
            expect(postArgs.uri).to.equal('/on/demandware.servlet/webdav/Sites/cartridges/mycode.zip');
            expect(postArgs.method).to.equal('POST');
            expect(postArgs.form.method).to.equal('UNZIP');
        });
    });

    describe('deleteFile function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
        });

        it('makes a delete request', function(){
            webdav.deleteFile('instance', '/cartridges', 'mycode.zip', 'mytoken', true, {}, function(){});

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.baseUrl).to.equal('https://instance');
            expect(postArgs.uri).to.equal('/on/demandware.servlet/webdav/Sites/cartridges/mycode.zip');
            expect(postArgs.method).to.equal('DELETE');
        });
    });
});