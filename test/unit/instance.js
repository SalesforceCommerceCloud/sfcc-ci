/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var sinon = require('sinon');

var proxyquire = require('proxyquire');

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
            sinon.assert.calledWith(get, 'default_instance');
        });
    });

    describe('export function', function() {

        var jobStub = sinon.spy();
        var instance = proxyquire('../../lib/instance', {
            'request': {},
            './job': jobStub
        });

        it('should call job.run with arguments passed', function() {
            var run = sinon.spy(jobStub, 'run');

            instance.export('my.instance', {"foo":{"bar":"something"},"something":false}, 'export.zip', true);

            run.restore();
            sinon.assert.calledOnceWithExactly(run,'my.instance', 'sfcc-site-archive-export', {
                data_units : {"foo":{"bar":"something"},"something":false},
                export_file : 'export.zip',
                overwrite_export_file : false
            }, true);
        });
    });

    describe('exportSync function', function() {

        var jobStub = sinon.spy();
        var instance = proxyquire('../../lib/instance', {
            'request': {},
            './job': jobStub
        });

        it('should call job.runSync with arguments passed', function() {
            var runSync = sinon.spy(jobStub, 'runSync');

            instance.exportSync('my.instance', {"foo":{"bar":"something"},"something":false}, 'export.zip', true,
                false);

            runSync.restore();
            sinon.assert.calledOnceWithExactly(runSync,'my.instance', 'sfcc-site-archive-export', {
                data_units : {"foo":{"bar":"something"},"something":false},
                export_file : 'export.zip',
                overwrite_export_file : false
            }, true, false);
        });
    });
});