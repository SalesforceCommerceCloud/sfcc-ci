var chai = require('chai');
var sinon = require('sinon');

var assert = chai.assert;
var should = chai.should();

describe('Tests for lib/instance.js', function() {

    describe('getInstance function', function() {

        it('should return argument as is by default, if not configured alias', function() {
            require('../../lib/instance').getInstance('aliasOrHost').should.equal('aliasOrHost');
        });

        it('should call config.get, if no argument passed', function() {
            var config = require('../../lib/config').obtain();
            var get = sinon.spy(config, 'get');

            require('../../lib/instance').getInstance();

            get.restore();
            sinon.assert.calledWith(get, 'SFCC_INSTANCE');
        });
    });
});