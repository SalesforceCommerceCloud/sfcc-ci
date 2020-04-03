/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var chai = require('chai');

var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();
var proxyquire = require('proxyquire').noCallThru();;
var sinon = require('sinon');

describe('Tests for lib/cartridge.js', function() {

    describe('add function', function() {
        it('Should post expected request body for global cartridge add', function() {
            var requestResult = {};
            var module = proxyquire('../../lib/cartridge',
                {
                    './auth' : {getToken: function(){
                        return '1'
                    }},
                    './log' : {},
                    './ocapi' : {getOptions: function(instance) {
                        if (instance === 'zzzz-999') {
                            return {mockOptions: true}
                        }
                    }},
                    'request' : {post: function(options) {
                        requestResult = options;
                    }}
                });
            // instance, cartridgename, position, target, siteid, verbose
            module.add('zzzz-999', 'your_shop_here', 'first', 'bc_api')
            var expected = {mockOptions: true, body : { name: 'your_shop_here', position: 'first'}};

            expect(requestResult).to.deep.equal(expected);
        });

        it('Should post expected request body for relative cartridge add', function() {
            var requestResult = {};
            var module = proxyquire('../../lib/cartridge',
                {
                    './auth' : {getToken: function(){
                        return '1'
                    }},
                    './log' : {},
                    './ocapi' : {getOptions: function(instance) {
                        if (instance === 'zzzz-999') {
                            return {mockOptions: true}
                        }
                    }},
                    'request' : {post: function(options) {
                        requestResult = options;
                    }}
                });
            // instance, cartridgename, position, target, siteid, verbose
            module.add('zzzz-999', 'your_shop_here', 'after', 'bc_api')
            var expected = {mockOptions: true, body : { name: 'your_shop_here', position: 'after', target: 'bc_api' } };

            expect(requestResult).to.deep.equal(expected);
        });

        it('Should inform via callback about sucessful cartridge add', function() {
            var consoleResult;
            var module = proxyquire('../../lib/cartridge',
                {
                    './auth' : {getToken: function(){
                        return '1'
                    }},
                    './log' : {info: function(message, string1, string2, string3){
                        consoleResult = message + string1 + string2 + string3;
                    }},
                    './ocapi' : {
                        getOptions: function(instance) {
                            if (instance === 'zzzz-999') {
                                return {mockOptions: true}
                            }
                        },
                        ensureValidToken: function(err, res, success, wait) {
                            success(false, {statusCode: 200});
                        }
                    },
                    'request' : {post: function(options, callback) {
                        callback();
                    }}
                });
            // instance, cartridgename, position, target, siteid, verbose
            module.add('zzzz-999', 'your_shop_here', 'before', 'bc_api', 'YourShopHere')

            expect(consoleResult).to.equal('Cartridge %s added on %s (%s)your_shop_herezzzz-999YourShopHere');
        });

        it('Should inform verbose log  about cartridge add attempt', function() {
            var consoleResult = '';
            var module = proxyquire('../../lib/cartridge',
                {
                    './auth' : {getToken: function(){
                        return '1'
                    }},
                    './log' : {info: function(message, arg1, string2, string3){
                        if (typeof(arg1) === 'string') {
                            consoleResult += message + arg1 + string2 + string3;
                        } else {
                            consoleResult += message + JSON.stringify(arg1);
                        }
                    }},
                    './ocapi' : {
                        getOptions: function(instance) {
                            if (instance === 'zzzz-999') {
                                return {mockOptions: true}
                            }
                        },
                        ensureValidToken: function(err, res, success, wait) {
                            success(false, {statusCode: 200});
                        }
                    },
                    'request' : {post: function(options, callback) {
                        callback();
                    }}
                });
            // instance, cartridgename, position, target, siteid, verbose
            module.add('zzzz-999', 'your_shop_here', 'before', 'bc_api', 'YourShopHere', true)

            expect(consoleResult).to.equal('Attempting Cartridge Add Request ' +
                '{"mockOptions":true,"body":{"name":"your_shop_here","position":"before","target":"bc_api"}}' +
                'Cartridge %s added on %s (%s)your_shop_herezzzz-999YourShopHere');
        });

        it('Should warn via callback about cartridge already add', function() {
            var consoleResult;
            var module = proxyquire('../../lib/cartridge',
                {
                    './auth' : {getToken: function(){
                        return '1'
                    }},
                    './log' : {warn: function(message, string1, string2){
                        consoleResult = message + string1 + string2;
                    }},
                    './ocapi' : {
                        getOptions: function(instance) {
                            if (instance === 'zzzz-999') {
                                return {mockOptions: true}
                            }
                        },
                        ensureValidToken: function(err, res, success, wait) {
                            success(true, {statusCode: 500, body: {fault: {type: 'CartridgeAlreadyExistException'}}});
                        }
                    },
                    'request' : {post: function(options, callback) {
                        callback();
                    }}
                });
            // instance, cartridgename, position, target, siteid, verbose
            module.add('zzzz-999', 'your_shop_here', 'before', 'bc_api', 'YourShopHere')

            expect(consoleResult).to.equal('Cartridge %s already active on %syour_shop_herezzzz-999');
        });

        it('Should error via callback if OCAPI cannot add cartridge', function() {
            var consoleResult;
            var module = proxyquire('../../lib/cartridge',
                {
                    './auth' : {getToken: function(){
                        return '1'
                    }},
                    './log' : {error: function(message, string1, string2){
                        consoleResult = message + string1 + string2;
                    }},
                    './ocapi' : {
                        getOptions: function(instance) {
                            if (instance === 'zzzz-999') {
                                return {mockOptions: true}
                            }
                        },
                        ensureValidToken: function(err, res, success, wait) {
                            success(true, {statusCode: 500, body: {fault: {type: 'FatalError'}}});
                        }
                    },
                    'request' : {post: function(options, callback) {
                        callback();
                    }}
                });
            // instance, cartridgename, position, target, siteid, verbose
            module.add('zzzz-999', 'your_shop_here', 'before', 'bc_api', 'YourShopHere')

            expect(consoleResult).to.equal('Adding Cartridge  %s on %s failed: %s (%s)your_shop_herezzzz-999');
        });

    });
});