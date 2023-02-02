var chai = require('chai');

var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();
var proxyquire = require('proxyquire').noCallThru();;
var sinon = require('sinon');

describe('Tests for lib/secrets.js', function() {

    describe('getClientID function', function() {
        it('Should return original value passed', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {init: function(){}}
                });
            var result = module.getClientID('aaaa-bbbb-cccc-dddd');
            var expected = 'aaaa-bbbb-cccc-dddd';

            expect(result).to.equal(expected);
        });

        it('Should return value in dw.json prop', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return { 'client-id': 'zzzz-yyyy-xxxx' }
                        }
                    }
                });
            var result = module.getClientID(undefined);
            var expected = 'zzzz-yyyy-xxxx';

            expect(result).to.equal(expected);
        });

        it('Should throw error if secret not found', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return {}
                        }
                    }
                });
            assert.throws(function() {
                module.getClientID(undefined);
            }, Error, "Failed to lookup secret SFCC_OAUTH_CLIENT_ID");
        });
    });

    describe('getClientSecret function', function() {
        it('Should return original value passed', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {init: function(){}}
                });
            var result = module.getClientSecret('****some-secret****');
            var expected = '****some-secret****';

            expect(result).to.equal(expected);
        });

        it('Should return value in dw.json prop', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return { 'client-secret': '****another-secret****' }
                        }
                    }
                });
            var result = module.getClientSecret(undefined);
            var expected = '****another-secret****';

            expect(result).to.equal(expected);
        });

        it('Should throw error if secret not found', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return {}
                        }
                    }
                });
            assert.throws(function() {
                module.getClientSecret(undefined);
            }, Error, "Failed to lookup secret SFCC_OAUTH_CLIENT_SECRET");
        });
    });

    describe('getUsername function', function() {
        it('Should return original value passed', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {init: function(){}}
                });
            var result = module.getUsername('user@org');
            var expected = 'user@org';

            expect(result).to.equal(expected);
        });

        it('Should return value in dw.json prop', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return { 'username': 'another.user@org' }
                        }
                    }
                });
            var result = module.getUsername(undefined);
            var expected = 'another.user@org';

            expect(result).to.equal(expected);
        });

        it('Should throw error if secret not found', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return {}
                        }
                    }
                });
            assert.throws(function() {
                module.getUsername(undefined);
            }, Error, "Failed to lookup secret SFCC_OAUTH_USER_NAME");
        });
    });

    describe('getPassword function', function() {
        it('Should return original value passed', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {init: function(){}}
                });
            var result = module.getPassword('sEcReTpA§§w0rd');
            var expected = 'sEcReTpA§§w0rd';

            expect(result).to.equal(expected);
        });

        it('Should return value in dw.json prop', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return { 'password': 'P@$$pHr@§E!' }
                        }
                    }
                });
            var result = module.getPassword(undefined);
            var expected = 'P@$$pHr@§E!';

            expect(result).to.equal(expected);
        });

        it('Should throw error if secret not found', function() {
            var module = proxyquire('../../lib/secrets',
                {
                    'dotenv' : {config: function(){}},
                    './log' : {debug: function(){}},
                    './dwjson' : {
                        init: function() {
                            return {}
                        }
                    }
                });
            assert.throws(function() {
                module.getPassword(undefined);
            }, Error, "Failed to lookup secret SFCC_OAUTH_USER_PASSWORD");
        });
    });
});