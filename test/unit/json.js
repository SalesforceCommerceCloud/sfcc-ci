/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var chai = require('chai');

var assert = chai.assert;
var expect = chai.expect;

describe('Tests for lib/json.js', function() {

    describe('sort function', function() {

        var source = [ { id : 3, name : 'foo' }, { id : 2, name : 'test' }, { id : 1, name : 'bar' } ];
        var sortedByName = [ { id : 1, name : 'bar' }, { id : 3, name : 'foo' }, { id : 2, name : 'test' } ];
        var sortedById = [ { id : 1, name : 'bar' }, { id : 2, name : 'test' }, { id : 3, name : 'foo' } ];

        var source2 = [ { unknown : 'no' }, { foo : 'bar' }, { unknown : 1 } ];
        var sortedByPartiallyUnknownProp = [ { foo : 'bar' }, { unknown : 'no' }, { unknown : 1 } ];

        it('should sort strings asc', function() {
            expect(require('../../lib/json').sort(source, 'name')).to.deep.equal(
                sortedByName);
        });

        it('should sort numbers asc', function() {
            expect(require('../../lib/json').sort(source, 'id')).to.deep.equal(
                sortedById);
        });

        it('should treat sort by undefined property same as empty string', function() {
            expect(require('../../lib/json').sort(source2, 'unknown')).to.deep.equal(
                sortedByPartiallyUnknownProp);
        });
    });
});