const os = require('os'),
    path = require('path'),

    // 3rd party
    fse = require('fs-extra'),
    request = require('request'),
    xmlJs = require('xml-js'),

    // local libraries
    auth = require('./auth'),
    job = require('./job'),
    console = require('./log'),
    ocapi = require('./ocapi'),
    fsUtils = require('./utils/fs-utils'),
    webdav = require('./webdav');


// where to store archive files before they are uploaded
const TMP_DIR = os.tmpdir(),

    // how long to wait if job is running before checking status again
    JOB_STATUS_RETRY_PERIOD = 1000,

    // oldest supported OCAPI permissions file version
    MIN_OCAPI_JSON_VERSION = 15.4;

// finds & loads an app object
// returns a promise with data loaded from the app definition file or undefined if not found
// adds a baseDir attribute to appDef object for dir containing app definition file
function getApp(appFile) {
    if (!appFile) {
        appFile = path.join(process.cwd(), 'app.json');
    }
    return fse.pathExists(appFile)
        .then(function(exists) {
            if (exists) {
                return fse.readJson(appFile)
                    .then(appDef => {
                        appDef.baseDir = path.dirname(appFile);
                        return appDef;
                    });
            } else {
                return undefined;
            }
        });
}

// installs an app for the given sites based on app definition
function install(instance, appDef, sites, version, clientId, verbose) {
    console.info('Installing %s', appDef.name);

    const installer = new Installer(instance, appDef, sites, version, clientId, verbose)
    return installer.install();
}

// installer class
// not meant for reuse, it's expected that a new instance will be created for each install
class Installer {
    constructor(instance, appDef, sites, version, clientId, verbose) {
        this.instance = instance;
        this.appDef = appDef;
        this.sites = sites;
        this.version = version;
        this.clientId = clientId;
        this.verbose = verbose ? true : false;
    }

    install() {
        let OCAPIPermissions;

        return this.readOCAPIPermissions()
            .then(permissionObjs => OCAPIPermissions = permissionObjs)
            .then(() => this.uploadCode())
            .then(() => this.importSites())
            .then(() => this.updateCartridgePaths())
            .then(() => this.addOCAPIPermissions(OCAPIPermissions))
            .then(() => console.info('Installation complete'));
    }

    // uploads code cartridges listed in app definition and return promise
    uploadCode() {
        const toClean = [];
        let promise = Promise.resolve();

        this.appDef.cartridges.forEach(cartridge => {
            if (this.verbose) {
                console.info('Uploading cartridge %s', cartridge.name);
            }
            const randomId = Math.floor(Math.random() * 999999),
                tmpDir = path.join(TMP_DIR, `cartridge_${randomId}`),
                versionDir = path.join(tmpDir, this.version),
                appDir = path.join(versionDir, cartridge.name),
                codeArchive = `${tmpDir}.zip`,
                token = auth.getToken();

            fse.mkdirSync(tmpDir);
            fse.mkdirSync(versionDir);
            fse.mkdirSync(appDir);
            toClean.push([tmpDir, codeArchive]);

            promise = promise
                .then(() => fse.copy(path.join(this.appDef.baseDir, cartridge.path), appDir))
                .then(() => fsUtils.zipDirectory(tmpDir))
                .then(() => webdav.deployCodePromise(this.instance, codeArchive, token, {}))
        });

        // make sure to clean up all dirs and zip files regardless
        // of which ones may have errored or completed
        const finalClean = function() {
            toClean.forEach(clean => {
                const dir = clean[0];
                let archive = clean[1];
                if (!fse.pathExistsSync(archive)) {
                    archive = undefined;
                }
                this.cleanUp(dir, archive);
            });
        }.bind(this);

        return promise
            .then(() => finalClean())
            .catch(err => {
                finalClean();
                throw err;
            });
    }

    // runs full site import for each site
    // only includes global business objects in first site import
    // NOTE: site import jobs have to be run serially
    importSites() {
        let promise = Promise.resolve();
        this.sites.forEach((site, index) => {
            const includeGlobal = (index === 0);
            promise = promise.then(() => this.importSite(site, includeGlobal));
        });
        return promise;
    }

    importSite(site, includeGlobal) {
        if (this.verbose) {
            console.info('Running site import for site %s', site);
        }

        const [parentDir, importDir] = this.createImportDir(),
            importFile = `${parentDir}.zip`,
            importFileName = path.basename(importFile);

        let promise = Promise.resolve(),
            shouldRunImport = false;

        // check if we should add any global business objects
        if (this.appDef.businessobjects.global.length > 0 && includeGlobal) {
            promise = this.addGlobalBusinessObjects(importDir, site);
            shouldRunImport = true;
        }

        // check if we should add any site business objects
        if (this.appDef.businessobjects.site.length > 0) {
            promise = promise.then(() => this.addSiteBusinessObjects(importDir, site));
            shouldRunImport = true;
        }

        // only do a site import if there was at least one business object added
        if (shouldRunImport) {
            return promise
                .then(() => fsUtils.zipDirectory(parentDir))
                .then(() => this.uploadImportFile(importFile))
                .then(() => this.runSiteImportJob(importFileName))
                .then(() => this.deleteServerZipFile(importFileName))
                .then(() => this.cleanUp(parentDir, importFile))
                .catch(err => {
                    // make sure cleanup happens either way
                    try {
                        this.cleanUp(parentDir, importFile);
                    } catch (err2) {
                        // ignore case where dir/file not created in the first place
                    }
                    throw err;
                });
        } else {
            // nothing to do but remove empty import dir that was created
            // and return an empty promise
            this.cleanUp(parentDir);
            return promise;
        }
    }

    // creates and returns directories used for site import archive
    createImportDir() {
        const randomId = Math.floor(Math.random() * 999999),
            parentDir = path.join(TMP_DIR, `cc_install_${randomId}`),
            importDir = path.join(parentDir, `cc_install_${randomId}`);
        fse.mkdirSync(parentDir);
        fse.mkdirSync(importDir);
        return [parentDir, importDir];
    }

    // loops over site business object files listed in app definition
    // and adds them into importDir
    addSiteBusinessObjects(importDir, site) {
        const promises = [];

        this.appDef.businessobjects.site.forEach(busObjFile => {
            if (this.verbose) {
                console.info('  adding site business object file %s', busObjFile);
            }

            const xmlContent = fse.readFileSync(path.join(this.appDef.baseDir, busObjFile), 'utf-8'),
                jsContent = xmlJs.xml2js(xmlContent),
                busObjFilePath = this.getBusinessObjectFilePath(jsContent, site),
                fileName = path.join(importDir, busObjFilePath);

            // fse will create dir if it does not exist
            promises.push(fse.outputFile(fileName, xmlContent));
        });

        // return when all files have been copied into import dir
        return Promise.all(promises);
    }

    // loops over global business object files listed in app definition
    // and adds them into importDir
    addGlobalBusinessObjects(importDir, site) {
        const promises = [];

        this.appDef.businessobjects.global.forEach(busObjFile => {
            if (this.verbose) {
                console.info('  adding global business object file %s', busObjFile);
            }

            const xmlContent = fse.readFileSync(path.join(this.appDef.baseDir, busObjFile), 'utf-8'),
                jsContent = xmlJs.xml2js(xmlContent),
                busObjFilePath = this.getBusinessObjectFilePath(jsContent),
                fileName = path.join(importDir, busObjFilePath);

            // fse will create dir if it does not exist
            promises.push(fse.outputFile(fileName, xmlContent));
        });

        // return when all files have been copied into import dir
        return Promise.all(promises);
    }

    // returns a path for a given business object based on type parsed from XML content
    // if site is null/undefined, busObj is assumed to be global
    getBusinessObjectFilePath(busObj, site) {
        if (busObj.elements.length !== 1) {
            throw new Error(`${busObj.elements.length} elements found but expected exactly 1!`);
        }

        const busObjType = busObj.elements[0].name,
            randomId = Math.floor(Math.random() * 999999);

        if (site) {
            const siteMappings = {
                'payment-settings': path.join('sites', site, 'payment-methods.xml'),
                'payment-processors': path.join('sites', site, 'payment-processors.xml'),
                'shipping': path.join('sites', site, 'shipping.xml'),
                'library': path.join('sites', site, 'library', 'library.xml'),
                'preferences': path.join('sites', site, 'preferences.xml'),
                'custom-objects': path.join('sites', site, 'custom-objects', `custom-objects_${randomId}.xml`),
            };
            if (siteMappings[busObjType]) {
                return siteMappings[busObjType];
            }
        } else {
            const globalMappings = {
                'metadata': path.join('meta', `metadata_${randomId}.xml`),
                'services': 'services.xml',
                'jobs': 'jobs.xml',
                'preferences': 'preferences.xml',
            };
            if (globalMappings[busObjType]) {
                return globalMappings[busObjType];
            }
        }

        // no mapping found for type
        throw new Error(`Unknown ${site ? 'site' : ''} business object type: ${busType}`);
    }

    uploadImportFile(importFile) {
        const token = auth.getToken();
        return new Promise((resolve, reject) => {
            webdav.postFile(this.instance, webdav.WEBDAV_INSTANCE_IMPEX, importFile, token, true, {}, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    runSiteImportJob(importFileName) {
        if (this.verbose) {
            console.info('  starting site import job');
        }

        let resolve, reject;
        const token = auth.getToken(),
            jobId = `sfcc-site-archive-import`,
            promise = new Promise((rslv, rjct) => {
                resolve = rslv;
                reject = rjct;
            });

        job.runJob(this.instance, jobId, { file_name: importFileName }, token, (err, res) => {
            if (err) {
                throw err;
            }
            if (res.statusCode < 200 || res.statusCode > 299) {
                reject(new Error(`Site Import job unexpected response code: ${res.statusCode}`));
                return;
            }

            const jobExecutionId = res.body.id;

            if (!jobExecutionId) {
                reject(new Error('Problem running import job, archive may not have completely uploaded yet'));
                return;
            }

            // inner function bound to this object (was easier than dealing with half a dozen args)
            const pollJob = function() {
                job.api.status(this.instance, jobId, jobExecutionId, token, (res, err) => {
                    if (err) {
                        console.error('Error polling for site import job: %s', err);
                        throw err;
                    }

                    // keep polling if job is still running
                    if (res.status === 'RUNNING' || res.status === 'PENDING') {
                        setTimeout(() => {
                            pollJob();
                        }, JOB_STATUS_RETRY_PERIOD);
                    } else if (res.status === 'OK') {
                        resolve();
                    } else {
                        reject(new Error(`Unexpected job status: ${res.status}`));
                    }
                });
            }.bind(this);

            // wait a little and then poll job for the first time
            setTimeout(pollJob, JOB_STATUS_RETRY_PERIOD);
        });

        return promise;
    }

    deleteServerZipFile(importFileName) {
        const token = auth.getToken();
        return new Promise((resolve, reject) => {
            webdav.deleteFile(
                this.instance, webdav.WEBDAV_INSTANCE_IMPEX, importFileName, token, false, {}, (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
        });
    }

    // update cartridge path for each cartridge on each site being installed
    // also update bm-specific cartridge path for any applicable cartridges
    updateCartridgePaths() {
        const businessManagerSite = 'Sites-Site',
            promises = [];

        this.appDef.cartridges.forEach(cartridge => {
            if (cartridge.businessmanager) {
                promises.push(this.putCartridgePath(businessManagerSite, cartridge.name));
            } else {
                this.sites.forEach(site => {
                    promises.push(this.putCartridgePath(site, cartridge.name));
                });
            }
        });

        return Promise.all(promises);
    }

    // updates cartridge path on server for one site/cartridge pair
    // returns a Promise
    putCartridgePath(site, cartridgeName) {
        if (this.verbose) {
            console.info('Adding %s to cartridge path for site %s', cartridgeName, site);
        }

        const ocapiVersion = ocapi.getOcapiVersion(),
            token = auth.getToken();

        return new Promise((resolve, reject) => {
            const endpoint = `/s/-/dw/data/${ocapiVersion}/sites/${site}/cartridges`,
                options = ocapi.getOptions(this.instance, endpoint, token);

            options.body = {
                name: cartridgeName,
                position: 'first',
            };

            request.post(options, (err, res) => {
                if (err) {
                    console.error('Error updating cartridge path for site %s and cartridge %s', site, cartridgeName);
                    reject(err);
                } else if (res.body && res.body.fault) {
                    // only warn if cartridge already exists in cartridge path
                    if (res.body.fault.type === 'CartridgeAlreadyExistException') {
                        console.info(`Cartridge ${cartridgeName} was already in cartridge path for site ${site}.` +
                            ' Path was left unchanged.');
                        resolve();
                    } else {
                        const msg = 'Error updating cartridge path for site %s and cartridge %s';
                        console.error(msg, site, cartridgeName);
                        reject(new Error(res.body.fault.type + ': ' + res.body.fault.message));
                    }
                }
                resolve();
            });
        });
    }

    // reads any OCAPI permission files included in the app definition
    // validates that files can be loaded and have min required version
    // returns promise with permission objects loaded
    readOCAPIPermissions() {
        const permissions = {
            site: [],
            global: [],
        };

        let promise = Promise.resolve();

        if (this.appDef.ocapi) {
            if (this.appDef.ocapi.site) {
                promise = promise.then(() => {
                    return Promise.all(this.appDef.ocapi.site.map(permissionFile => {
                        return this.readOCAPIFile(path.join(this.appDef.baseDir, permissionFile));
                    }))
                        .then(sitePermissionObjs => permissions.site.push(...sitePermissionObjs));
                });
            }

            if (this.appDef.ocapi.global) {
                promise = promise.then(() => {
                    return Promise.all(this.appDef.ocapi.global.map(permissionFile => {
                        return this.readOCAPIFile(path.join(this.appDef.baseDir, permissionFile));
                    }))
                        .then(globalPermissionObjs => permissions.global.push(...globalPermissionObjs));
                });
            }
        }

        // finally resolve permissions object either way
        return promise
            .then(() => permissions);
    }

    // reads a single OCAPI permissions file
    // returns a promise with contents of JSON file as an object
    readOCAPIFile(permissionFile) {
        const versionErr = `OCAPI Permission file ${permissionFile} version must be at least ${MIN_OCAPI_JSON_VERSION}`,
            clientsErr = `OCAPI Permission file ${permissionFile} must have exactly one client defined`,
            missingErr = `OCAPI Permission file ${permissionFile} not found`;

        return fse.pathExists(permissionFile)
            .then(function(exists) {
                if (exists) {
                    return fse.readJson(permissionFile)
                        .then(permissionObj => {
                            if (!permissionObj._v || permissionObj._v < MIN_OCAPI_JSON_VERSION) {
                                throw new Error(versionErr);
                            }
                            if (permissionObj.clients.length !== 1) {
                                throw new Error(clientsErr);
                            }
                            return permissionObj;
                        });
                } else {
                    throw new Error(missingErr);
                }
            });
    }

    // adds the given OCAPI permissions to global and/or site contexts
    // permissions object should be one returned from readOCAPIPermissions function
    addOCAPIPermissions(permissions) {
        const promises = [];

        if (permissions.global) {
            permissions.global.forEach(permissionObj =>
                promises.push(this.patchOCAPIPermissions(permissionObj)));
        }

        if (permissions.site) {
            this.sites.forEach(site => {
                permissions.site.forEach(permissionObj =>
                    promises.push(this.patchOCAPIPermissions(permissionObj, site)));
            });
        }

        return Promise.all(promises);
    }

    // updates cartridge path on server for one site/cartridge pair
    // returns a Promise
    // adds OCAPI permissions for a single clientID and either global or site context
    // if this.clientId is set it will be used to replace client_id in JSON data
    // if site is null/undefined then global context is assumed
    patchOCAPIPermissions(permissionObj, site) {
        const ocapiVersion = ocapi.getOcapiVersion(),
            token = auth.getToken();

        return new Promise((resolve, reject) => {
            const endpoint = site ?
                    `/s/-/dw/data/${ocapiVersion}/sites/${site}/ocapiconfig/data` :
                    `/s/-/dw/data/${ocapiVersion}/ocapiconfig/data`,
                options = ocapi.getOptions(this.instance, endpoint, token);

            if (this.clientId) {
                permissionObj.clients[0].client_id = this.clientId;
            }

            if (this.verbose) {
                if (site) {
                    const msg = 'Adding OCAPI settings for client ID %s to site %s';
                    console.info(msg, permissionObj.clients[0].client_id, site);
                } else {
                    console.info('Adding global OCAPI settings for client ID %s', permissionObj.clients[0].client_id);
                }
            }

            options.body = permissionObj;

            request.patch(options, (err, res) => {
                // save a "fault" response into err for consistent handling below
                if (!err && res.body && res.body.fault) {
                    // only warn if fault type is duplicate client id
                    if (res.body.fault.type === 'DuplicateClientIdException') {
                        const cid = permissionObj.clients[0].client_id;
                        if (site) {
                            console.info(
                                `Client ID ${cid} already has OCAPI data config for site ${site}. It was not updated.`);
                        } else {
                            console.info(
                                `Client ID ${cid} already has OCAPI global data config. It was not updated.`);
                        }
                    } else {
                        err = new Error(res.body.fault.type + ': ' + res.body.fault.message);
                    }
                }

                // handle any errors and reject
                if (err) {
                    if (site) {
                        console.error('Error updating OCAPI permissions for site %s', site);
                    } else {
                        console.error('Error updating global OCAPI permissions');
                    }
                    if (err) {
                        reject(err);
                    } else {
                        reject(new Error(res.body.fault.type + ': ' + res.body.fault.message));
                    }
                }
                resolve();
            });
        });
    }

    // zipFile is optional
    cleanUp(directory, zipFile) {
        fsUtils.recursiveRmDir(directory);
        if (zipFile) {
            fse.unlinkSync(zipFile);
        }
    }
}

module.exports = {
    getApp,
    install,
    Installer,
};
