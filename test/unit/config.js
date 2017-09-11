var chai = require('chai');

var assert = chai.assert;
var should = chai.should();

describe('Tests for lib/config.js', function() {

    describe('obtain function', function() {

        it('should not return null', function() {
            require('../../lib/config').obtain().should.not.equal(null);
        });
    });
});