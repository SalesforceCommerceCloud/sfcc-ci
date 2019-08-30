var chai = require('chai');
chai.use(require('chai-fs'));
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();

describe('Tests for lib/archive.js', function() {

    describe('archive function', function() {
        var target = 'target.zip';
        var source = '../cli/target';
        it('should create an target.zip for source folder', function() {
            require('../../lib/archive').archive(target, source);
            expect(target).to.have.extname('.zip');

        });

        it('should throw TypeError if no target is provided', function() {
            expect(function() {
                require('../../lib/archive').archive(null, source);
            }).to.throw(TypeError);
        });

        it('should throw TypeError if no source is provided', function() {
            expect(function() {
                require('../../lib/archive').archive(target, null);
            }).to.throw(TypeError);
        });
    });

});
