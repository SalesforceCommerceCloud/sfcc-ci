/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
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