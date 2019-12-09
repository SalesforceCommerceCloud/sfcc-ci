var chai = require('chai');
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var expect = chai.expect;

// stub of the request library
var requestStub = sinon.spy();

describe('Tests for lib/code.js', function() {

    var code = proxyquire('../../lib/code', {
        'request': requestStub,
        './auth': {
            'getToken' : () => 'mytoken'
        }
    });

    describe('cli.delete function', function() {

        it('makes a delete request', function(){
            var code = proxyquire('../../lib/code', {
                'request': requestStub,
                './auth': {
                    'getToken' : () => 'mytoken'
                }
            });
            code.cli.delete('instance', 'delete_version', false);

            const postArgs = requestStub.getCall(0).args[0];
            expect(postArgs.uri).to.equal('https://instance/s/-/dw/data/v19_5/code_versions/delete_version');
            expect(postArgs.method).to.equal('DELETE');
        });
    });
});