var chai = require('chai');
var sinon = require('sinon');

var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();

describe('Tests for lib/ocapi.js', function() {

    describe('getOptions function', function() {

        var sfcc_auth = require('../../index').auth;

        it('should return an object with required keys', function() {
            var options = require('../../lib/ocapi').getOptions([]);
            expect(options).to.be.an('object').to.have.all.keys('uri', 'auth', 'strictSSL', 'method', 'json');
            expect(options).to.have.property('strictSSL', true);
            expect(options).to.have.property('json', true);
        });
    });
});