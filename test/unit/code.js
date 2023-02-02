/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var chai = require('chai');
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var expect = chai.expect;

// stub of the request library
var requestStub = sinon.spy();

// stub of the log library
var testbase = require('./_base');
var errorStub = testbase.errorLogStub;
var warnStub = testbase.warnLogStub;

describe('Tests for lib/code.js', function() {

    var code = proxyquire('../../lib/code', {
        'request': requestStub,
        './auth': {
            'getToken' : () => 'mytoken'
        }
    });

    describe('cli.activate function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
        });

        it('makes a patch request', function(){
            code.cli.activate('instance', 'version_to_activate');

            const patchArgs = requestStub.getCall(0).args[0];
            expect(patchArgs.uri).to.equal('https://instance/s/-/dw/data/v19_5/code_versions/version_to_activate');
            expect(patchArgs.method).to.equal('PATCH');
        });
    });

    describe('cli.delete function', function() {

        beforeEach(function() {
            requestStub.resetHistory();
        });

        it('makes a delete request', function(){
            code.cli.delete('instance', 'delete_version', false);

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.uri).to.equal('https://instance/s/-/dw/data/v19_5/code_versions/delete_version');
            expect(postArgs.method).to.equal('DELETE');
        });
    });

    describe('cli.deploy function', function() {

        beforeEach(function() {
            errorStub.resetHistory();
            warnStub.resetHistory();
        });

        it('should error out if file does not exist', function(){

            var code = proxyquire('../../lib/code', {
                'fs' : {
                    'existsSync' :  () => false,
                    'statSync' : function () {
                        return {
                            'isFile' : () => false
                        }
                    }
                }
            });

            code.cli.deploy('instance', 'mycode.zip', {}, function(){});

            const errorArgs = errorStub.getCall(0).args;
            expect(errorArgs[0]).to.equal('File "mycode.zip" does not exist');
        });

        it('should log error if file is not a file', function(){
            var code = proxyquire('../../lib/code', {
                'fs' : {
                    'existsSync' :  () => true,
                    'statSync' : function () {
                        return {
                            'isFile' : () => false
                        }
                    }
                }
            });
            code.cli.deploy('instance', 'mycode.zip', {}, function(){});

            const errorArgs = errorStub.getCall(0).args;
            expect(errorArgs[0]).to.equal('File "mycode.zip" does not exist or is not a file');
        });
    });
});