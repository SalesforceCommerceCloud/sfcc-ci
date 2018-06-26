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
    packageModule = require('../../lib/package'),
    job = require('../../lib/job'),
    webdav = require('../../lib/webdav');


describe('Tests for lib/package.js', function() {

    describe('getPackage function', function() {
        let pathExistsStub,
            readJsonStub,
            packageObject;

        beforeEach(() => {
            packageObject = {};
            pathExistsStub = sinon.stub(fse, 'pathExists').resolves(true);
            readJsonStub = sinon.stub(fse, 'readJson').resolves(packageObject);
        });

        afterEach(() => {
            pathExistsStub.restore();
            readJsonStub.restore();

        });

        it('looks for cc-package.json in cwd if no package file given', () => {
            packageModule.getPackage();
            assert(pathExistsStub.calledWith(process.cwd() + '/cc-package.json'));
        });

        it('returns package JSON if package file exists', () => {
            return packageModule.getPackage()
                .then(jsonResult => {
                    expect(jsonResult).to.equal(packageObject);
                });
        });

        it('returns undefined if package file does not exist', () => {
            pathExistsStub.resolves(false);

            return packageModule.getPackage()
                .then(jsonResult => {
                    expect(jsonResult).to.be.undefined;
                });
        });

        it('adds a baseDir attribute to package object', () => {
            return packageModule.getPackage()
                .then(jsonResult => {
                    expect(jsonResult.baseDir).to.exist;
                });
        });
    });

    describe('install function', function() {
        const authToken = 'abcdefg1234567',
            jobId = 12345;

        let putStub,
            getTokenStub,
            deployCodePromiseStub,
            postFileStub,
            runJobResult,
            runJobStub,
            statusResult,
            statusStub,
            errorStub,
            getJobRetryTimeStub,
            clock;

        beforeEach(() => {
            mockFs({
                'test_app': {
                    'cartridges': {
                        'int_test': {
                            'controllers': {
                                'test.js': 'var x = 1;',
                            },
                            'int_test.properties':
`demandware.cartridges.plugin_productcompare.multipleLanguageStorefront=true
demandware.cartridges.int_test.id=int_test`,
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
                    },
                    'cc-package.json':
`{
    "name": "test_app",
    "version": "1.0",
    "description": "fake app for unit tests",
    "cartridges": [
        {
            "name": "int_test",
            "businessmanager" : false,
            "path": "./cartridges/int_test"
        }
    ],
    "businessobjects": [
        "./metadata/metadata.xml"
    ]

}`,
                },
            });

            putStub = sinon.stub(request, 'put').callsFake(
                (options, callback) => callback()
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

            getJobRetryTimeStub = sinon.stub(packageModule, 'getJobRetryTimeStub').returns(10);

            // mock out system clock but have time proceed
            clock = lolex.install({ shouldAdvanceTime: true, advanceTimeDelta: 50 });

        });

        afterEach(() => {
            mockFs.restore();
            putStub.restore();
            getTokenStub.restore();
            deployCodePromiseStub.restore();
            postFileStub.restore();
            runJobStub.restore();
            statusStub.restore();
            deleteFileStub.restore();
            errorStub.restore();
            getJobRetryTimeStub.restore();
            clock.uninstall();
        });

        it('installs an app', done => {
            packageModule.getPackage('./test_app/cc-package.json')
                .then(packageDef => {
                    packageModule.install('localhost', packageDef, 'MySite', '1')
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

                            expect(putStub.args[0][0].uri).to.equal(
                                'https://localhost/s/-/dw/data/v1/sites/MySite/addcartridge/int_test');
                            expect(putStub.args[0][0].auth.bearer).to.equal(authToken);

                            expect(errorStub.callCount).to.equal(0);

                            // verify that local temp files were cleaned up
                            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

                            done();
                        });
                });
        });

        it('handles an error deploying code', done => {
            deployCodePromiseStub.rejects(new Error('Uh oh'));
            packageModule.getPackage('./test_app/cc-package.json')
                .then(packageDef => {
                    packageModule.install('localhost', packageDef, 'MySite', '1')
                        .catch(err => {
                            expect(postFileStub.callCount).to.equal(0);
                            expect(runJobStub.callCount).to.equal(0);
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(putStub.callCount).to.equal(0);

                            expect(errorStub.args[0][1].message).to.equal('Uh oh');

                            // verify that local temp files were cleaned up
                            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

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
            packageModule.getPackage('./test_app/cc-package.json')
                .then(packageDef => {
                    packageModule.install('localhost', packageDef, 'MySite', '1')
                        .catch(err => {
                            expect(runJobStub.callCount).to.equal(0);
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(putStub.callCount).to.equal(0);

                            expect(errorStub.args[0][1].message).to.equal('eeek!');

                            // verify that local temp files were cleaned up
                            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

                            done();
                        });
                });
        });

        it('errors if site import job returns non-200-level status code', done => {
            runJobResult.statusCode = 400;
            packageModule.getPackage('./test_app/cc-package.json')
                .then(packageDef => {
                    packageModule.install('localhost', packageDef, 'MySite', '1')
                        .catch(err => {
                            expect(statusStub.callCount).to.equal(0);
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(putStub.callCount).to.equal(0);

                            expect(errorStub.args[0][1].message).to.equal(
                                'Site Import job unexpected response code: 400');

                            // verify that local temp files were cleaned up
                            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

                            done();
                        });
                });
        });

        it('errors if site import job status returns unexpected status', done => {
            statusResult.status = 'FAILED';
            packageModule.getPackage('./test_app/cc-package.json')
                .then(packageDef => {
                    packageModule.install('localhost', packageDef, 'MySite', '1')
                        .catch(err => {
                            expect(deleteFileStub.callCount).to.equal(0);
                            expect(putStub.callCount).to.equal(0);

                            expect(errorStub.args[0][1].message).to.equal('Unexpected job status: FAILED');

                            // verify that local temp files were cleaned up
                            expect(fse.readdirSync(os.tmpdir()).length).to.equal(0);

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

            packageModule.getPackage('./test_app/cc-package.json')
                .then(packageDef => {
                    packageModule.install('localhost', packageDef, 'MySite', '1')
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

            packageModule.getPackage('./test_app/cc-package.json')
                .then(packageDef => {
                    packageModule.install('localhost', packageDef, 'MySite', '1')
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
        it('throws an error if no elements attribute', () => {
            expect(() => packageModule.testing.getBusinessObjectFilePath()).to.throw();
        });

        it('throws an error if elements attribute is empty', () => {
            expect(() => packageModule.testing.getBusinessObjectFilePath({ elements: []})).to.throw();
        });

        it('returns path for metadata', () => {
            expect(packageModule.testing.getBusinessObjectFilePath({
                elements: [{
                    name: 'metadata'
                }],
            }, 'SiteXYZ')).to.include('metadata');
        });

        it('returns path for services', () => {
            expect(packageModule.testing.getBusinessObjectFilePath({
                elements: [{
                    name: 'services'
                }],
            }, 'SiteXYZ')).to.equal('services.xml');
        });

        it('returns path for site payment settings', () => {
            expect(packageModule.testing.getBusinessObjectFilePath({
                elements: [{
                    name: 'payment-settings'
                }],
            }, 'SiteXYZ')).to.equal('sites/SiteXYZ/payment-methods.xml');
        });

        it('returns path for site content library', () => {
            expect(packageModule.testing.getBusinessObjectFilePath({
                elements: [{
                    name: 'library'
                }],
            }, 'SiteXYZ')).to.equal('sites/SiteXYZ/library.xml');
        });
    });

});

