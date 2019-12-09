var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// stub of the request library
var requestStub = sinon.spy();

var testbase = require('./_base');

var consError = testbase.errorLogStub;
var consJson = testbase.jsonLogStub;
var consInfo = testbase.infoLogStub;
var consTable = testbase.tableLogStub;
var consPretty = testbase.prettyPrintLogStub;

describe('Alias Tests for lib/sandbox.js', function() {
    const existingAlias = {
        kind: "SandboxAlias",
        code: 200,
        status: "Success",
        data: {
            id: "a1",
            name: "www.example.com",
            sandboxId: "s1"
        }
    };

    const aliasList = {
        kind: "SandboxAliasList",
        code: 200,
        status: "Success",
        data: [{
            id: "a1",
            name: "www.example.com",
            sandboxId: "s1",
            registration: "link"
        }]
    };
    var sandbox = proxyquire('../../lib/sandbox', {
        'request': requestStub,
        './auth': {
            'getToken' : () => 'mytoken'
        },
        './ocapi': {
            'ensureValidToken': function (err, res, callback1, callback2) {},
            'getOptions': function(method, url) {
                return {uri: url}
            },
            'retryableCall': function (method, url, responseHandler) {
                if (url.uri) {
                    url = url.uri
                }
                if (url.endsWith('/system')) {
                    responseHandler("", {statusCode: 200, body: {data: {inboundIps: ["one"]}}});
                    return
                }
                if (url.includes('invalidSandboxId')) {
                    responseHandler("Invalid sandbox ID.", {statusCode: 400, body: {}});
                    return
                }
                if (url.includes('invalidAliasId')) {
                    responseHandler("Invalid alias ID.", {statusCode: 400, body: {}});
                    return
                }
                if (url.includes('unknownSandboxId')) {
                    responseHandler("Sandbox not found.", {statusCode: 404, body: {}});
                    return
                }
                if (url.includes('unknownAliasId')) {
                    responseHandler("Alias not found.", {statusCode: 404, body: {}});
                    return
                }
                if (url.endsWith('/aliases')) {
                    if (method === 'GET') {
                        responseHandler("", {statusCode: 200, body: aliasList});
                    } else {
                        responseHandler("", {statusCode: 201, body: existingAlias});
                    }
                    return
                }
                if (method === 'GET') {
                    responseHandler("", {statusCode: 200, body: existingAlias})
                } else {
                    // delete
                    responseHandler("", {statusCode: 204, body: {}})
                }
            }
        }
    });

    describe('Get single Alias', function() {
        it('Read SBX existing alias', () => {
            sandbox.cli.alias.get({id: "s1"},"a1", true);
            sinon.assert.calledWith(consJson, existingAlias.data);
            sandbox.cli.alias.get({id: "s1"},"a1", false);
            sinon.assert.calledWith(consPretty, existingAlias.data);
        });
        it('Read SBX invalid alias', () => {
            sandbox.cli.alias.get({id: "s1"},"invalidAliasId", true);
            sinon.assert.calledWith(consJson, {error: "Reading sandbox alias failed: Invalid alias ID."});
            sandbox.cli.alias.get({id: "s1"},"invalidAliasId", false);
            sinon.assert.calledWith(consError, "Reading sandbox alias failed: Invalid alias ID.");
        });
        it('Read SBX alias not found', () => {
            sandbox.cli.alias.get({id: "s1"},"unknownAliasId", true);
            sinon.assert.calledWith(consJson, {error: "Reading sandbox alias failed: Alias not found."});
            sandbox.cli.alias.get({id: "s1"},"unknownAliasId", false);
            sinon.assert.calledWith(consError, "Reading sandbox alias failed: Alias not found.");
        });
        it('Read SBX alias, invalid sandbox', () => {
            sandbox.cli.alias.get({id: "invalidSandboxId"},"s1", true);
            sinon.assert.calledWith(consJson, {error: "Reading sandbox alias failed: Invalid sandbox ID."});
            sandbox.cli.alias.get({id: "invalidSandboxId"},"s1", false);
            sinon.assert.calledWith(consError, "Reading sandbox alias failed: Invalid sandbox ID.");
        });
        it('Read SBX alias, sandbox not found', () => {
            sandbox.cli.alias.get({id: "unknownSandboxId"},"s1", true);
            sinon.assert.calledWith(consJson, {error: "Reading sandbox alias failed: Sandbox not found."});
            sandbox.cli.alias.get({id: "unknownSandboxId"},"s1", false);
            sinon.assert.calledWith(consError, "Reading sandbox alias failed: Sandbox not found.");
        });
    })

    describe('Create Alias', function() {
        it('Create alias', () => {
            sandbox.cli.alias.create({id: "s1"},"alias", true);
            sinon.assert.calledWith(consJson, existingAlias.data);
            sandbox.cli.alias.create({id: "s1"},"alias", false);
            sinon.assert.calledWith(consPretty, existingAlias.data);
        });
        it('Create SBX alias, invalid sandbox', () => {
            sandbox.cli.alias.create({id: "invalidSandboxId"},"alias", true);
            sinon.assert.calledWith(consJson, {error: "Creating sandbox alias failed: Invalid sandbox ID."});
            sandbox.cli.alias.create({id: "invalidSandboxId"},"alias", false);
            sinon.assert.calledWith(consError, "Creating sandbox alias failed: Invalid sandbox ID.");
        });
        it('Create SBX alias, sandbox not found', () => {
            sandbox.cli.alias.create({id: "unknownSandboxId"},"alias", true);
            sinon.assert.calledWith(consJson, {error: "Creating sandbox alias failed: Sandbox not found."});
            sandbox.cli.alias.create({id: "unknownSandboxId"},"alias", false);
            sinon.assert.calledWith(consError, "Creating sandbox alias failed: Sandbox not found.");
        });
    })

    describe('List Aliases', function() {
        it('List aliases', () => {
            sandbox.cli.alias.list({id: "s1"}, true);
            sinon.assert.calledWith(consJson, aliasList.data);
            sandbox.cli.alias.list({id: "s1"}, false);
            sinon.assert.calledWith(consTable, [['id','name','sandbox','register'],
                ["a1","www.example.com","s1","link"]]);
        });
        it('List aliases, invalid sandbox ID', () => {
            sandbox.cli.alias.list({id: "invalidSandboxId"}, true);
            sinon.assert.calledWith(consJson, {error: "Getting sandbox aliases failed: Invalid sandbox ID."});
            sandbox.cli.alias.list({id: "invalidSandboxId"}, false);
            sinon.assert.calledWith(consError, "Getting sandbox aliases failed: Invalid sandbox ID.");
        });
        it('List aliases, sandbox not found', () => {
            sandbox.cli.alias.list({id: "unknownSandboxId"}, true);
            sinon.assert.calledWith(consJson, {error: "Getting sandbox aliases failed: Sandbox not found."});
            sandbox.cli.alias.list({id: "unknownSandboxId"}, false);
            sinon.assert.calledWith(consError, "Getting sandbox aliases failed: Sandbox not found.");
        });
    });

    describe('Delete Alias', function() {
        it('Delete existing alias', () => {
            sandbox.cli.alias.remove({id: "s1"},"a1", true);
            sinon.assert.calledWith(consJson, {success: true});
            sandbox.cli.alias.remove({id: "s1"},"a1", false);
            sinon.assert.calledWith(consInfo, "Success");
        });
        it('Delete SBX invalid alias', () => {
            sandbox.cli.alias.remove({id: "s1"},"invalidAliasId", true);
            sinon.assert.calledWith(consJson, {error: "Deleting sandbox alias failed: Invalid alias ID."});
            sandbox.cli.alias.remove({id: "s1"},"invalidAliasId", false);
            sinon.assert.calledWith(consError, "Deleting sandbox alias failed: Invalid alias ID.");
        });
        it('Delete SBX alias not found', () => {
            sandbox.cli.alias.remove({id: "s1"},"unknownAliasId", true);
            sinon.assert.calledWith(consJson, {success: true});
            sandbox.cli.alias.remove({id: "s1"},"unknownAliasId", false);
            sinon.assert.calledWith(consInfo, "Success");
        });
        it('Delete SBX alias, invalid sandbox', () => {
            sandbox.cli.alias.remove({id: "invalidSandboxId"},"s1", true);
            sinon.assert.calledWith(consJson, {error: "Deleting sandbox alias failed: Invalid sandbox ID."});
            sandbox.cli.alias.remove({id: "invalidSandboxId"},"s1", false);
            sinon.assert.calledWith(consError, "Deleting sandbox alias failed: Invalid sandbox ID.");
        });
        it('Delete SBX alias, sandbox not found', () => {
            sandbox.cli.alias.remove({id: "unknownSandboxId"},"s1", true);
            sinon.assert.calledWith(consJson, {success: true});
            sandbox.cli.alias.remove({id: "unknownSandboxId"},"s1", false);
            sinon.assert.calledWith(consInfo, "Success");
        });
    });

    beforeEach(function () {
        consJson.resetHistory();
        consPretty.resetHistory();
        consError.resetHistory();
        consTable.resetHistory();
        consInfo.resetHistory();
    });
});