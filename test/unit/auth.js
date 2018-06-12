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

    var auth = proxyquire('../../lib/auth', {
        'request': requestStub,
        './dwjson': {
            init : () => dwjsonMock,
        },
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

    describe('getAutoRenewToken function', function() {

        it('should call config.get on relevant configuration key', function() {
            var spy = sinon.spy(config, 'get');

            auth.getAutoRenewToken();

            sinon.assert.calledWith(spy, 'SFCC_CLIENT_RENEW_TOKEN');
            spy.restore();
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

    describe('auth function', () => {
        const clientKey = 'ABCD-1234-EFGH',
              clientSecret = 'FooBar!!',
              clientKey2 = '7777-8888-9999',
              clientSecret2 = 'BizBazBuzzz',
              user = 'test-user@test.com',
              password = 'abc123',
              AMURI1 = 'account-pod5.demandware.net',
              AMURI2 = 'account-pod99.demandware.edu';

        describe('building request to obtain token', function() {
            beforeEach(() => {
                requestStub.post.reset();
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

            it('will look up client/secret from dwjson if needed', function() {
                dwjsonMock['client-id'] = clientKey2;
                dwjsonMock['client-secret'] = clientSecret2;
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

});
