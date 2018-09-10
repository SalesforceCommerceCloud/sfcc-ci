const os = require('os');

const chai = require('chai'),
    fse = require('fs-extra'),
    lolex = require('lolex'),
    mockFs = require('mock-fs'),
    request = require('request'),
    sinon = require('sinon');

const assert = chai.assert,
    expect = chai.expect;

const auth = require('../../lib/auth'),
    console = require('../../lib/log'),
    app = require('../../lib/app'),
    job = require('../../lib/job'),
    webdav = require('../../lib/webdav');

const appBoth = require('./app_files/app-both.json'),
    appGlobal = require('./app_files/app-global.json'),
    appSite = require('./app_files/app-site.json'),
    appNone = require('./app_files/app-none.json');

describe('Tests for lib/app.js', function() {

    describe('getApp function', function() {
        let pathExistsStub,
            readJsonStub,
            appDef;

        beforeEach(() => {
            appDef = {};
            pathExistsStub = sinon.stub(fse, 'pathExists').resolves(true);
            readJsonStub = sinon.stub(fse, 'readJson').resolves(appDef);
        });

        afterEach(() => {
            pathExistsStub.restore();
            readJsonStub.restore();

        });

        it('looks for app.json in cwd if no app def file given', () => {
            app.getApp();
            assert(pathExistsStub.calledWith(process.cwd() + '/app.json'));
        });

        it('returns app JSON if app def file exists', () => {
            return app.getApp()
                .then(jsonResult => {
                    expect(jsonResult).to.equal(appDef);
                });
        });

        it('returns undefined if app file does not exist', () => {
            pathExistsStub.resolves(false);

            return app.getApp()
                .then(jsonResult => {
                    expect(jsonResult).to.be.undefined;
                });
        });

        it('adds a baseDir attribute to app def object', () => {
            return app.getApp()
                .then(jsonResult => {
                    expect(jsonResult.baseDir).to.exist;
                });
        });
    });

    describe('install function', function() {
        const authToken = 'abcdefg1234567',
            jobId = 12345;

        let postStub,
            patchStub,
            getTokenStub,
            deployCodePromiseStub,
            postFileStub,
            runJobResult,
            runJobStub,
            statusResult,
            statusStub,
            errorStub,
            infoStub,
            getJobRetryTimeStub,
            clock,
            clockInterval;

        beforeEach(() => {
            mockFs({
                'test_app': {
                    'cartridges': {
                        'int_test': {
                            'controllers': {
                                'test.js': 'var x = 1;',
                            },
                            'int_test.properties':
`demandware.cartridges.int_test.multipleLanguageStorefront=true
demandware.cartridges.int_test.id=int_test`,
                        },
                        'int_test_bm': {
                            'int_test_bm.properties':
`demandware.cartridges.int_test_bm.multipleLanguageStorefront=true
demandware.cartridges.int_test_bm.id=int_test_bm`,
                        },
                    },
                    'metadata': {
                        'metadata.xml':
`<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://www.demandware.com/xml/impex/metadata/2006-10-31">
    <type-extension type-id="SitePreferences">
        <custom-attribute-definitions>
            <attribute-definition attribute-id="PrefThisIsATest">
                <display-name xml:lang="x-default">Is this a test?</display-name>
                <type>string</type>
                <mandatory-flag>false</mandatory-flag>
                <externally-managed-flag>false</externally-managed-flag>
            </attribute-definition>
        </custom-attribute-definitions>
    </type-extension>
</metadata>
`,
                        'site-prefs.xml':
`<?xml version="1.0" encoding="UTF-8"?>
<preferences xmlns="http://www.demandware.com/xml/impex/preferences/2007-03-31">
    <custom-preferences>
        <all-instances/>
        <development>
            <preference preference-id="PrefThisIsATest">yes it is</preference>
        </development>
    </custom-preferences>
</preferences>
`,
                        'ocapi-data.json':
`{
  "_v":"17.6",
  "clients":
  [
    {

      "client_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "resources":
      [
        {
          "resource_id":"/jobs/*/executions",
          "methods":["post"],
          "read_attributes":"(**)",
          "write_attributes":"(**)"
        }
      ]
    }
  ]
}
`,
                    },
                    'app-both.json': JSON.stringify(appBoth),
                    'app-global.json': JSON.stringify(appGlobal),
                    'app-site.json': JSON.stringify(appSite),
                    'app-none.json': JSON.stringify(appNone),
                },
            });

            postStub = sinon.stub(request, 'post').callsFake(
                (options, callback) => callback(null, {})
            );

            patchStub = sinon.stub(request, 'patch').callsFake(
                (options, callback) => callback(null, {})
            );

            getTokenStub = sinon.stub(auth, 'getToken').returns(authToken);

            deployCodePromiseStub = sinon.stub(webdav, 'deployCodePromise').resolves();

            postFileStub = sinon.stub(webdav, 'postFile').callsFake(
                (instance, path, file, token, ignoreLocalFilePath, options, callback) => callback()
            );

            runJobResult = {
                statusCode: 200,
                body: {
                    id: jobId,
                },
            };

            runJobStub = sinon.stub(job, 'runJob').callsFake(
                (instance, job_id, request_doc, token, callback) => callback(null, runJobResult)
            );

            statusResult = {
                status: 'OK',
            };

            statusStub = sinon.stub(job.api, 'status').callsFake(
                (instance, job_id, job_execution_id, token, callback) => callback(statusResult)
            );

            deleteFileStub = sinon.stub(webdav, 'deleteFile').callsFake(
                (instance, path, file, token, ignoreLocalFilePath, options, callback) => callback()
            );

            errorStub = sinon.stub(console, 'error');
            infoStub = sinon.stub(console, 'info');

            // use lolex to mock out setTimeout and advance system clock 50ms for every 10ms of real time
            // (this is to speed up app.js JOB_STATUS_RETRY_PERIOD)
            clock = lolex.install({ toFake: ['setTimeout'] });
            clockInterval = setInterval(() => clock.tick(50), 10);
        });

        afterEach(() => {
            // local temp files should always have been cleaned up
            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

            mockFs.restore();
            postStub.restore();
            patchStub.restore();
            getTokenStub.restore();
            deployCodePromiseStub.restore();
            postFileStub.restore();
            runJobStub.restore();
            statusStub.restore();
            deleteFileStub.restore();
            errorStub.restore();
            infoStub.restore();
            clock.uninstall();
            clearInterval(clockInterval); // newer mocha versions will not exit with open intervals/timeouts
        });

        it('installs an app with global and site metadata and a bm-specific cartridge and OCAPI permissions', done => {
            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .then(() => {
                            // verify that external dependencies were called as expected
                            expect(deployCodePromiseStub.args[0][0]).to.equal('localhost');
                            expect(deployCodePromiseStub.args[0][1]).to.match(/cartridge_.*\.zip/);
                            expect(deployCodePromiseStub.args[0][2]).to.equal(authToken);

                            expect(postFileStub.args[0][0]).to.equal('localhost');
                            expect(postFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(postFileStub.args[0][3]).to.equal(authToken);

                            expect(runJobStub.args[0][0]).to.equal('localhost');
                            expect(runJobStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(runJobStub.args[0][2].file_name).to.match(/cc_install_.*\.zip/);
                            expect(runJobStub.args[0][3]).to.equal(authToken);

                            expect(statusStub.args[0][0]).to.equal('localhost');
                            expect(statusStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(statusStub.args[0][2]).to.equal(jobId);
                            expect(statusStub.args[0][3]).to.equal(authToken);

                            expect(deleteFileStub.args[0][0]).to.equal('localhost');
                            expect(deleteFileStub.args[0][1]).to.equal('/impex/src/instance');
                            expect(deleteFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(deleteFileStub.args[0][3]).to.equal(authToken);

                            // verify cartridge path OCAPI call
                            expect(postStub.args.length).to.equal(3);
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/MySite/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[0][0].auth.bearer).to.equal(authToken);
                            expect(postStub.args[1][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/Sites-Site/cartridges');
                            expect(postStub.args[1][0].body.name).to.equal('int_test_bm');
                            expect(postStub.args[1][0].body.position).to.equal('first');

                            // verify OCAPI permissions OCAPI call
                            expect(patchStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/MySite/ocapiconfig/data');
                            expect(patchStub.args[0][0].body.clients[0].client_id).to.equal(
                                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
                            expect(patchStub.args[0][0].auth.bearer).to.equal(authToken);

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[2][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(2);
                            expect(postData.list_cartidges_installed).to.equal('int_test,int_test_bm');
                            expect(postData.count_business_objects_installed).to.equal(2);
                            expect(postData.list_business_objects_installed).to.equal('metadata,preferences');

                            done();
                        });
                });
        });

        it('installs an app with global and site metadata and a bm-specific cartridge on multiple sites', done => {
            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['SiteA', 'SiteB'], '1')
                        .then(() => {
                            // code deployed once per cartridge
                            expect(deployCodePromiseStub.callCount).to.equal(2);

                            // site import run twice
                            expect(postStub.args.length).to.equal(4);
                            expect(postFileStub.callCount).to.equal(2);
                            expect(runJobStub.callCount).to.equal(2);
                            expect(statusStub.callCount).to.equal(2);
                            expect(deleteFileStub.callCount).to.equal(2);

                            // correct site-specific path used for OCAPI calls
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteA/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[1][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteB/cartridges');
                            expect(postStub.args[1][0].body.name).to.equal('int_test');
                            expect(postStub.args[1][0].body.position).to.equal('first');

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[3][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(2);
                            expect(postData.list_cartidges_installed).to.equal('int_test,int_test_bm');
                            expect(postData.count_business_objects_installed).to.equal(2);
                            expect(postData.list_business_objects_installed).to.equal('metadata,preferences');

                            done();
                        });
                });
        });

        it('installs an app with only global metadata', done => {
            app.getApp('./test_app/app-global.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .then(() => {
                            // verify that external dependencies were called as expected
                            expect(deployCodePromiseStub.args[0][0]).to.equal('localhost');
                            expect(deployCodePromiseStub.args[0][1]).to.match(/cartridge_.*\.zip/);
                            expect(deployCodePromiseStub.args[0][2]).to.equal(authToken);

                            expect(postFileStub.args[0][0]).to.equal('localhost');
                            expect(postFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(postFileStub.args[0][3]).to.equal(authToken);

                            expect(runJobStub.args[0][0]).to.equal('localhost');
                            expect(runJobStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(runJobStub.args[0][2].file_name).to.match(/cc_install_.*\.zip/);
                            expect(runJobStub.args[0][3]).to.equal(authToken);

                            expect(statusStub.args[0][0]).to.equal('localhost');
                            expect(statusStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(statusStub.args[0][2]).to.equal(jobId);
                            expect(statusStub.args[0][3]).to.equal(authToken);

                            expect(deleteFileStub.args[0][0]).to.equal('localhost');
                            expect(deleteFileStub.args[0][1]).to.equal('/impex/src/instance');
                            expect(deleteFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(deleteFileStub.args[0][3]).to.equal(authToken);

                            expect(postStub.args.length).to.equal(2);
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/MySite/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[0][0].auth.bearer).to.equal(authToken);

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[1][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(1);
                            expect(postData.list_cartidges_installed).to.equal('int_test');
                            expect(postData.count_business_objects_installed).to.equal(1);
                            expect(postData.list_business_objects_installed).to.equal('metadata');

                            done();
                        });
                });
        });

        it('installs an app with only global metadata on multiple sites', done => {
            app.getApp('./test_app/app-global.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['SiteA', 'SiteB'], '1')
                        .then(() => {
                            // code only deployed once
                            expect(deployCodePromiseStub.callCount).to.equal(1);

                            // site import only run once (global metadata)
                            expect(postFileStub.callCount).to.equal(1);
                            expect(runJobStub.callCount).to.equal(1);
                            expect(statusStub.callCount).to.equal(1);
                            expect(deleteFileStub.callCount).to.equal(1);

                            // correct site-specific path used for OCAPI calls
                            expect(postStub.args.length).to.equal(3);
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteA/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[1][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteB/cartridges');
                            expect(postStub.args[1][0].body.name).to.equal('int_test');
                            expect(postStub.args[1][0].body.position).to.equal('first');

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[2][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(1);
                            expect(postData.list_cartidges_installed).to.equal('int_test');
                            expect(postData.count_business_objects_installed).to.equal(1);
                            expect(postData.list_business_objects_installed).to.equal('metadata');

                            done();
                        });
                });
        });

        it('installs an app with only site metadata', done => {
            app.getApp('./test_app/app-site.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .then(() => {
                            // verify that external dependencies were called as expected
                            expect(deployCodePromiseStub.args[0][0]).to.equal('localhost');
                            expect(deployCodePromiseStub.args[0][1]).to.match(/cartridge_.*\.zip/);
                            expect(deployCodePromiseStub.args[0][2]).to.equal(authToken);

                            expect(postFileStub.args[0][0]).to.equal('localhost');
                            expect(postFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(postFileStub.args[0][3]).to.equal(authToken);

                            expect(runJobStub.args[0][0]).to.equal('localhost');
                            expect(runJobStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(runJobStub.args[0][2].file_name).to.match(/cc_install_.*\.zip/);
                            expect(runJobStub.args[0][3]).to.equal(authToken);

                            expect(statusStub.args[0][0]).to.equal('localhost');
                            expect(statusStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(statusStub.args[0][2]).to.equal(jobId);
                            expect(statusStub.args[0][3]).to.equal(authToken);

                            expect(deleteFileStub.args[0][0]).to.equal('localhost');
                            expect(deleteFileStub.args[0][1]).to.equal('/impex/src/instance');
                            expect(deleteFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(deleteFileStub.args[0][3]).to.equal(authToken);

                            expect(postStub.args.length).to.equal(2);
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/MySite/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[0][0].auth.bearer).to.equal(authToken);

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[1][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(1);
                            expect(postData.list_cartidges_installed).to.equal('int_test');
                            expect(postData.count_business_objects_installed).to.equal(1);
                            expect(postData.list_business_objects_installed).to.equal('preferences');

                            done();
                        });
                });
        });

        it('installs an app with only site metadata on multiple sites', done => {
            app.getApp('./test_app/app-site.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['SiteA', 'SiteB'], '1')
                        .then(() => {
                            // code only deployed once
                            expect(deployCodePromiseStub.callCount).to.equal(1);

                            // site import run twice
                            expect(postFileStub.callCount).to.equal(2);
                            expect(runJobStub.callCount).to.equal(2);
                            expect(statusStub.callCount).to.equal(2);
                            expect(deleteFileStub.callCount).to.equal(2);

                            // correct site-specific path used for OCAPI calls
                            expect(postStub.args.length).to.equal(3);
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteA/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[1][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteB/cartridges');
                            expect(postStub.args[1][0].body.name).to.equal('int_test');
                            expect(postStub.args[1][0].body.position).to.equal('first');

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[2][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(1);
                            expect(postData.list_cartidges_installed).to.equal('int_test');
                            expect(postData.count_business_objects_installed).to.equal(1);
                            expect(postData.list_business_objects_installed).to.equal('preferences');

                            done();
                        });
                });
        });

        it('installs an app with no metadata', done => {
            app.getApp('./test_app/app-none.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .then(() => {
                            // verify that external dependencies were called as expected
                            expect(deployCodePromiseStub.args[0][0]).to.equal('localhost');
                            expect(deployCodePromiseStub.args[0][1]).to.match(/cartridge_.*\.zip/);
                            expect(deployCodePromiseStub.args[0][2]).to.equal(authToken);

                            // site import not run
                            expect(postFileStub.callCount).to.equal(0);
                            expect(runJobStub.callCount).to.equal(0);
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);

                            expect(postStub.args.length).to.equal(2);
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/MySite/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[0][0].auth.bearer).to.equal(authToken);

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[1][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(1);
                            expect(postData.list_cartidges_installed).to.equal('int_test');
                            expect(postData.count_business_objects_installed).to.equal(0);
                            expect(postData.list_business_objects_installed).to.equal('');

                            done();
                        });
                });
        });

        it('installs an app with no metadata on multiple sites', done => {
            app.getApp('./test_app/app-none.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['SiteA', 'SiteB'], '1')
                        .then(() => {
                            // code only deployed once
                            expect(deployCodePromiseStub.callCount).to.equal(1);

                            // site import not run
                            expect(postFileStub.callCount).to.equal(0);
                            expect(runJobStub.callCount).to.equal(0);
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);

                            // correct site-specific path used for OCAPI calls
                            expect(postStub.args.length).to.equal(3);
                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteA/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[1][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/SiteB/cartridges');
                            expect(postStub.args[1][0].body.name).to.equal('int_test');
                            expect(postStub.args[1][0].body.position).to.equal('first');

                            // verify metrics were sent
                            const postData = JSON.parse(postStub.args[2][0].body);
                            expect(postData.access_token).to.equal('abcdefg1234567');
                            expect(postData.app_name).to.equal('test_app');
                            expect(postData.count_cartidges_installed).to.equal(1);
                            expect(postData.list_cartidges_installed).to.equal('int_test');
                            expect(postData.count_business_objects_installed).to.equal(0);
                            expect(postData.list_business_objects_installed).to.equal('');

                            done();
                        });
                });
        });

        it('reuses installer id on multiple installs', done => {
            let installerId;
            app.getApp('./test_app/app-none.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['SiteA'], '1')
                        .then(() => {
                            expect(postStub.args.length).to.equal(2);
                            const postData = JSON.parse(postStub.args[1][0].body);
                            installerId = postData.installer_id;
                        })
                        .then(() => app.install('localhost', appDef, ['SiteB'], '1'))
                        .then(() => {
                            expect(postStub.args.length).to.equal(4);
                            const postData = JSON.parse(postStub.args[3][0].body);
                            expect(postData.installer_id).to.equal(installerId);
                            done();
                        });
                });
        });

        it('handles an error deploying code', done => {
            deployCodePromiseStub.rejects(new Error('Uh oh'));
            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .catch(err => {
                            expect(postFileStub.callCount).to.equal(0);
                            expect(runJobStub.callCount).to.equal(0);
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(postStub.callCount).to.equal(0);

                            expect(err.message).to.equal('Uh oh');
                            done();
                        });
                });
        });


        it('handles an error importing site', done => {
            postFileStub.callsFake(
                (instance, path, file, token, ignoreLocalFilePath, options, callback) => {
                    callback(new Error('eeek!'));
                }
            );
            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .catch(err => {
                            expect(runJobStub.callCount).to.equal(0);
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(postStub.callCount).to.equal(0);

                            // error thrown
                            expect(err.message).to.equal('eeek!');
                            done();
                        });
                });
        });

        it('errors if site import job returns non-200-level status code', done => {
            runJobResult.statusCode = 400;
            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .catch(err => {
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(postStub.callCount).to.equal(0);

                            // error thrown
                            expect(err.message).to.equal('Site Import job unexpected response code: 400');
                            done();
                        });
                });
        });

        it('errors if site import job status returns unexpected status', done => {
            statusResult.status = 'FAILED';
            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .catch(err => {
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(postStub.callCount).to.equal(0);

                            // error thrown
                            expect(err.message).to.equal('Unexpected job status: FAILED');
                            done();
                        });
                });
        });

        it('logs message but does not error if cartridge already in cartridge path', done => {
            postStub.callsFake((options, callback) => callback(null, {
                body: {
                    fault: {
                        type: 'CartridgeAlreadyExistException'
                    }
                }
            }));

            app.getApp('./test_app/app-site.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .then(() => {
                            // verify that external dependencies were called as expected
                            expect(deployCodePromiseStub.args[0][0]).to.equal('localhost');
                            expect(deployCodePromiseStub.args[0][1]).to.match(/cartridge_.*\.zip/);
                            expect(deployCodePromiseStub.args[0][2]).to.equal(authToken);

                            expect(postFileStub.args[0][0]).to.equal('localhost');
                            expect(postFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(postFileStub.args[0][3]).to.equal(authToken);

                            expect(runJobStub.args[0][0]).to.equal('localhost');
                            expect(runJobStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(runJobStub.args[0][2].file_name).to.match(/cc_install_.*\.zip/);
                            expect(runJobStub.args[0][3]).to.equal(authToken);

                            expect(statusStub.args[0][0]).to.equal('localhost');
                            expect(statusStub.args[0][1]).to.equal('sfcc-site-archive-import');
                            expect(statusStub.args[0][2]).to.equal(jobId);
                            expect(statusStub.args[0][3]).to.equal(authToken);

                            expect(deleteFileStub.args[0][0]).to.equal('localhost');
                            expect(deleteFileStub.args[0][1]).to.equal('/impex/src/instance');
                            expect(deleteFileStub.args[0][2]).to.match(/cc_install_.*\.zip/);
                            expect(deleteFileStub.args[0][3]).to.equal(authToken);

                            expect(postStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v18_8/sites/MySite/cartridges');
                            expect(postStub.args[0][0].body.name).to.equal('int_test');
                            expect(postStub.args[0][0].body.position).to.equal('first');
                            expect(postStub.args[0][0].auth.bearer).to.equal(authToken);

                            // log message but no errors
                            expect(errorStub.callCount).to.equal(0);
                            // 3 because other two are install begin & complete messages
                            expect(infoStub.callCount).to.equal(3);
                            expect(infoStub.args[1][0]).to.match(/was already in cartridge path/);
                            done();
                        });
                });
        });

        it('retries if job status is RUNNING', done => {
            statusStub.onCall(0).callsFake(
                (instance, job_id, job_execution_id, token, callback) => {
                    callback({ status: 'RUNNING' });
                    clock.tick(900);
                }
            );
            statusStub.onCall(1).callsFake(
                (instance, job_id, job_execution_id, token, callback) => {
                    callback({ status: 'RUNNING' });
                    clock.tick(900);
                }
            );
            statusStub.onCall(2).callsFake(
                (instance, job_id, job_execution_id, token, callback) => {
                    callback({ status: 'OK' });
                    clock.tick(900);
                }
            );

            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .then(() => {
                            expect(statusStub.callCount).to.equal(3);

                            // verify that local temp files were cleaned up
                            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

                            done();
                        });
                });
        });

        it('retries if job status is PENDING', done => {
            statusStub.onCall(0).callsFake(
                (instance, job_id, job_execution_id, token, callback) => {
                    callback({ status: 'PENDING' });
                    clock.tick(900);
                }
            );
            statusStub.onCall(1).callsFake(
                (instance, job_id, job_execution_id, token, callback) => {
                    callback({ status: 'OK' });
                    clock.tick(900);
                }
            );

            app.getApp('./test_app/app-both.json')
                .then(appDef => {
                    app.install('localhost', appDef, ['MySite'], '1')
                        .then(() => {
                            expect(statusStub.callCount).to.equal(2);

                            // verify that local temp files were cleaned up
                            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

                            done();
                        });
                });
        });
    });

    describe('tests for getBusinessObjectFilePath function', () => {
        const installer = new app.Installer('localhost', {}, [], '1');

        it('throws an error if no elements attribute', () => {
            expect(() => installer.getBusinessObjectFilePath()).to.throw();
        });

        it('throws an error if elements attribute is empty', () => {
            expect(() => installer.getBusinessObjectFilePath({ elements: []})).to.throw();
        });

        it('throws an error if site given for global business object', () => {
            expect(() => {
                installer.getBusinessObjectFilePath({
                    elements: [{
                        name: 'metadata'
                    }],
                }, 'SiteXYZ');
            }).to.throw();
        });

        it('throws an error if site not given for site business object', () => {
            expect(() => {
                installer.getBusinessObjectFilePath({
                    elements: [{
                        name: 'library'
                    }],
                });
            }).to.throw();
        });

        it('returns path for global metadata', () => {
            expect(installer.getBusinessObjectFilePath({
                elements: [{
                    name: 'metadata'
                }],
            })).to.include('metadata');
        });

        it('returns path for global services', () => {
            expect(installer.getBusinessObjectFilePath({
                elements: [{
                    name: 'services'
                }],
            })).to.equal('services.xml');
        });

        it('returns path for global preferences', () => {
            expect(installer.getBusinessObjectFilePath({
                elements: [{
                    name: 'preferences'
                }],
            })).to.equal('preferences.xml');
        });

        it('returns path for site payment settings', () => {
            expect(installer.getBusinessObjectFilePath({
                elements: [{
                    name: 'payment-settings'
                }],
            }, 'SiteXYZ')).to.equal('sites/SiteXYZ/payment-methods.xml');
        });

        it('returns path for site preferences', () => {
            expect(installer.getBusinessObjectFilePath({
                elements: [{
                    name: 'preferences'
                }],
            }, 'SiteXYZ')).to.equal('sites/SiteXYZ/preferences.xml');
        });

        it('returns path for site content library', () => {
            expect(installer.getBusinessObjectFilePath({
                elements: [{
                    name: 'library'
                }],
            }, 'SiteXYZ')).to.equal('sites/SiteXYZ/library/library.xml');
        });

        it('returns path for site custom objects', () => {
            expect(installer.getBusinessObjectFilePath({
                elements: [{
                    name: 'custom-objects'
                }],
            }, 'SiteXYZ')).to.match(/sites\/SiteXYZ\/custom\-objects\/custom\-objects_[0-9]{0,6}\.xml/);
        });
    });

    describe('tests for installer readOCAPIPermissions function', () => {
        let pathExistsStub,
            readJsonStub,
            permissionObj,
            appDef,
            installer;

        beforeEach(() => {
            appDef = {
                baseDir: '/blah',
                ocapi: {
                    site: [
                        './site-ocapi-data1.json',
                        './site-ocapi-data2.json',
                    ],
                    global: [
                        './global-ocapi-data1.json',
                        './global-ocapi-data2.json',
                        './global-ocapi-data3.json',
                    ],
                },
            };
            installer = new app.Installer('localhost', appDef, [], '1');

            permissionObj = {
                _v: '17.6',
                clients: [{
                    client_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                }],
            };
            pathExistsStub = sinon.stub(fse, 'pathExists').resolves(true);
            readJsonStub = sinon.stub(fse, 'readJson').resolves(permissionObj);
        });

        afterEach(() => {
            pathExistsStub.restore();
            readJsonStub.restore();
        });

        it('reads multiple valid ocapi permissions files', done => {
            installer.readOCAPIPermissions(appDef)
                .then(() => done());
        });

        it('reads a valid site ocapi permissions file', done => {
            delete appDef.ocapi.global;
            appDef.ocapi.site.length = 1;
            installer.readOCAPIPermissions(appDef)
                .then(() => done());
        });

        it('reads when there are no ocapi permission files', done => {
            delete appDef.ocapi.site;
            delete appDef.ocapi.global;
            installer.readOCAPIPermissions(appDef)
                .then(() => done());
        });

        it('rejects when file is not found', done => {
            pathExistsStub.resolves(false);
            installer.readOCAPIPermissions(appDef)
                .catch(err => {
                    expect(err.message).to.equal('OCAPI Permission file /blah/site-ocapi-data1.json not found');
                    done();
                });
        });

        it('rejects when file has no version attribute', done => {
            delete permissionObj._v;
            installer.readOCAPIPermissions(appDef)
                .catch(err => {
                    expect(err.message).to.match(/^OCAPI Permission file.*version must be at least/);
                    done();
                });
        });

        it('rejects when file version is too old', done => {
            permissionObj._v = '15.2';
            installer.readOCAPIPermissions(appDef)
                .catch(err => {
                    expect(err.message).to.match(/^OCAPI Permission file.*version must be at least/);
                    done();
                });
        });

        it('rejects when file has no clients defined', done => {
            permissionObj.clients = [];
            installer.readOCAPIPermissions(appDef)
                .catch(err => {
                    expect(err.message).to.match(/^OCAPI Permission file.*must have exactly one client defined/);
                    done();
                });
        });

        it('rejects when file has more than one clients defined', done => {
            permissionObj.clients = [{}, {}, {}];
            installer.readOCAPIPermissions(appDef)
                .catch(err => {
                    expect(err.message).to.match(/^OCAPI Permission file.*must have exactly one client defined/);
                    done();
                });
        });

    });

    describe('tests for installer addOCAPIPermissions function', () => {
        let instance,
            sites,
            permissions,
            permissionObj,
            clientId,
            patchStub,
            errorStub,
            infoStub,
            installer;

        beforeEach(() => {
            instance = 'localhost';
            sites = ['SiteA'];
            permissions = {
                global: [],
                site: [],
            };
            permissionObj = {
                _v: '17.6',
                clients: [{
                    client_id: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                }],
            };
            clientId = undefined;
            patchStub = sinon.stub(request, 'patch').callsFake(
                (options, callback) => callback(null, {})
            );
            errorStub = sinon.stub(console, 'error');
            infoStub = sinon.stub(console, 'info');
            installer = new app.Installer('localhost', {}, sites, '1');
        });

        afterEach(() => {
            patchStub.restore();
            errorStub.restore();
            infoStub.restore();
        })

        it('resolves when there are no permissions to add', done => {
            installer.addOCAPIPermissions(permissions)
                .then(() => done());
        });

        it('adds data permissions for a site', done => {
            permissions.site.push(permissionObj);
            installer.addOCAPIPermissions(permissions)
                .then(() => {
                    expect(patchStub.args[0][0].uri).to.equal(
                        'https://localhost/s/-/dw/data/v18_8/sites/SiteA/ocapiconfig/data');
                    expect(patchStub.args[0][0].body).to.equal(permissionObj);
                    done();
                });
        });

        it('adds data permissions for two sites', done => {
            sites.push('SiteB');
            permissions.site.push(permissionObj);
            installer.addOCAPIPermissions(permissions)
                .then(() => {
                    expect(patchStub.args[0][0].uri).to.equal(
                        'https://localhost/s/-/dw/data/v18_8/sites/SiteA/ocapiconfig/data');
                    expect(patchStub.args[0][0].body).to.equal(permissionObj);
                    expect(patchStub.args[1][0].uri).to.equal(
                        'https://localhost/s/-/dw/data/v18_8/sites/SiteB/ocapiconfig/data');
                    expect(patchStub.args[1][0].body).to.equal(permissionObj);
                    done();
                });
        });

        it('adds global data permissions', done => {
            permissions.global.push(permissionObj);
            installer.addOCAPIPermissions(permissions)
                .then(() => {
                    expect(patchStub.args[0][0].uri).to.equal(
                        'https://localhost/s/-/dw/data/v18_8/ocapiconfig/data');
                    expect(patchStub.args[0][0].body).to.equal(permissionObj);
                    done();
                });
        });

        it('adds two sets of global data permissions', done => {
            permissions.global.push(permissionObj);
            permissions.global.push(permissionObj);
            installer.addOCAPIPermissions(permissions)
                .then(() => {
                    expect(patchStub.args[0][0].uri).to.equal(
                        'https://localhost/s/-/dw/data/v18_8/ocapiconfig/data');
                    expect(patchStub.args[0][0].body).to.equal(permissionObj);
                    expect(patchStub.args[1][0].uri).to.equal(
                        'https://localhost/s/-/dw/data/v18_8/ocapiconfig/data');
                    expect(patchStub.args[1][0].body).to.equal(permissionObj);
                    done();
                });
        });

        it('rejects if there is an error', done => {
            permissions.site.push(permissionObj);
            patchStub.callsFake(
                (options, callback) => callback('bad thing!', null)
            );
            installer.addOCAPIPermissions(permissions)
                .catch(err => {
                    expect(errorStub.callCount).to.equal(1);
                    done();
                });
        });

        it('logs message and resolves for DuplicateClientIdException', done => {
            permissions.site.push(permissionObj);
            patchStub.callsFake(
                (options, callback) => callback(null, {
                    body: {
                        fault: {
                            type: 'DuplicateClientIdException',
                        }
                    }
                })
            );
            installer.addOCAPIPermissions(permissions)
                .then(() => {
                    expect(infoStub.callCount).to.equal(1);
                    expect(infoStub.args[0][0]).to.match(/already has OCAPI data config/);
                    done();
                });
        });

        it('rejects for a fault response', done => {
            permissions.site.push(permissionObj);
            patchStub.callsFake(
                (options, callback) => callback(null, {
                    body: {
                        fault: {
                            type: 'SomeFatalException',
                        }
                    }
                })
            );
            installer.addOCAPIPermissions(permissions)
                .catch(() => {
                    expect(errorStub.callCount).to.equal(1);
                    done();
                });
        });
    });
});
