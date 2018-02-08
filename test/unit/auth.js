var chai = require('chai');
var sinon = require('sinon');

var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();

describe('Tests for lib/auth.js', function() {

    var auth = require('../../lib/auth');
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
});