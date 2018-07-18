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
function install(instance, appDef, sites, version) {
    console.info('Installing %s', appDef.name);

    let OCAPIPermissions;

    return readOCAPIPermissions(appDef)
        .then(permissionObjs => OCAPIPermissions = permissionObjs)
        .then(() => uploadCode(appDef, instance, version))
        .then(() => importSites(instance, appDef, sites))
        .then(() => updateCartridgePaths(instance, appDef, sites))
        .then(() => addOCAPIPermissions(instance, sites, OCAPIPermissions))
        .then(() => console.info('installation complete'))
}

// uploads code cartridges listed in app definition and return promise
function uploadCode(appDef, instance, version) {
    const toClean = [];
    let promise = Promise.resolve();

    appDef.cartridges.forEach(cartridge => {
        const randomId = Math.floor(Math.random() * 999999),
            tmpDir = path.join(TMP_DIR, `cartridge_${randomId}`),
            versionDir = path.join(tmpDir, version),
            appDir = path.join(versionDir, cartridge.name),
            codeArchive = `${tmpDir}.zip`,
            token = auth.getToken();

        fse.mkdirSync(tmpDir);
        fse.mkdirSync(versionDir);
        fse.mkdirSync(appDir);
        toClean.push([tmpDir, codeArchive]);
        promise = promise
                .then(fse.copy(path.join(appDef.baseDir, cartridge.path), appDir))
                .then(() => fsUtils.zipDirectory(tmpDir))
                .then(() => webdav.deployCodePromise(instance, codeArchive, token, {}))
    });

    // make sure to clean up all dirs and zip files regardless
    // of which ones may have errored or completed
    function finalClean() {
        toClean.forEach(clean => {
            const dir = clean[0];
            let archive = clean[1];
            if (!fse.pathExistsSync(archive)) {
                archive = undefined;
            }
            cleanUp(dir, archive);
        });
    }

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
function importSites(instance, appDef, sites) {
    let promise = Promise.resolve();
    sites.forEach((site, index) => {
        const includeGlobal = (index === 0);
        promise = promise.then(() => importSite(instance, appDef, site, includeGlobal));
    });
    return promise;
}

function importSite(instance, appDef, site, includeGlobal) {
    const [parentDir, importDir] = createImportDir(),
        importFile = `${parentDir}.zip`,
        importFileName = path.basename(importFile);

    let promise = Promise.resolve(),
        shouldRunImport = false;

    // check if we should add any global business objects
    if (appDef.businessobjects.global.length > 0 && includeGlobal) {
        promise = addGlobalBusinessObjects(appDef, importDir, site);
        shouldRunImport = true;
    }

    // check if we should add any site business objects
    if (appDef.businessobjects.site.length > 0) {
        promise = promise.then(() => addSiteBusinessObjects(appDef, importDir, site));
        shouldRunImport = true;
    }

    // only do a site import if there was at least one business object added
    if (shouldRunImport) {
        return promise
            .then(() => fsUtils.zipDirectory(parentDir))
            .then(() => uploadImportFile(instance, importFile))
            .then(() => runSiteImportJob(instance, importFileName))
            .then(() => deleteServerZipFile(instance, importFileName))
            .then(() => cleanUp(parentDir, importFile))
            .catch(err => {
                // make sure cleanup happens either way
                try {
                    cleanUp(parentDir, importFile);
                } catch (err2) {
                    // ignore case where dir/file not created in the first place
                }
                throw err;
            });
    } else {
        // nothing to do but remove empty import dir that was created
        // and return an empty promise
        cleanUp(parentDir);
        return promise;
    }
}

// creates and returns directories used for site import archive
function createImportDir() {
    const randomId = Math.floor(Math.random() * 999999),
        parentDir = path.join(TMP_DIR, `cc_install_${randomId}`),
        importDir = path.join(parentDir, `cc_install_${randomId}`);
    fse.mkdirSync(parentDir);
    fse.mkdirSync(importDir);
    return [parentDir, importDir];
}

// loops over site business object files listed in app definition
// and adds them into importDir
function addSiteBusinessObjects(appDef, importDir, site) {
    const promises = [];

    appDef.businessobjects.site.forEach(busObjFile => {
        const xmlContent = fse.readFileSync(path.join(appDef.baseDir, busObjFile), 'utf-8'),
            jsContent = xmlJs.xml2js(xmlContent),
            busObjFilePath = getBusinessObjectFilePath(jsContent, site),
            fileName = path.join(importDir, busObjFilePath);

        // fse will create dir if it does not exist
        promises.push(fse.outputFile(fileName, xmlContent));
    });

    // return when all files have been copied into import dir
    return Promise.all(promises);
}

// loops over global business object files listed in app definition
// and adds them into importDir
function addGlobalBusinessObjects(appDef, importDir, site) {
    const promises = [];

    appDef.businessobjects.global.forEach(busObjFile => {
        const xmlContent = fse.readFileSync(path.join(appDef.baseDir, busObjFile), 'utf-8'),
            jsContent = xmlJs.xml2js(xmlContent),
            busObjFilePath = getBusinessObjectFilePath(jsContent),
            fileName = path.join(importDir, busObjFilePath);

        // fse will create dir if it does not exist
        promises.push(fse.outputFile(fileName, xmlContent));
    });

    // return when all files have been copied into import dir
    return Promise.all(promises);
}

// returns a path for a given business object based on type parsed from XML content
// if site is null/undefined, busObj is assumed to be global
function getBusinessObjectFilePath(busObj, site) {
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

function uploadImportFile(instance, importFile) {
    const token = auth.getToken();
    return new Promise((resolve, reject) => {
        webdav.postFile(instance, webdav.WEBDAV_INSTANCE_IMPEX, importFile, token, true, {}, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function runSiteImportJob(instance, importFileName) {
    let resolve, reject;
    const token = auth.getToken(),
        jobId = `sfcc-site-archive-import`,
        promise = new Promise((rslv, rjct) => {
            resolve = rslv;
            reject = rjct;
        });

    job.runJob(instance, jobId, { file_name: importFileName }, token, (err, res) => {
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

        function pollJob() {
            job.api.status(instance, jobId, jobExecutionId, token, (res, err) => {
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
        }

        // wait a little and then poll job for the first time
        setTimeout(pollJob, JOB_STATUS_RETRY_PERIOD);
    });

    return promise;
}

function deleteServerZipFile(instance, importFileName) {
    const token = auth.getToken();
    return new Promise((resolve, reject) => {
        webdav.deleteFile(instance, webdav.WEBDAV_INSTANCE_IMPEX, importFileName, token, false, {}, (err, res) => {
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
function updateCartridgePaths(instance, appDef, sites) {
    const businessManagerSite = 'Sites-Site',
        promises = [];

    appDef.cartridges.forEach(cartridge => {
        if (cartridge.businessmanager) {
            promises.push(putCartridgePath(instance, businessManagerSite, cartridge.name));
        } else {
            sites.forEach(site => {
                promises.push(putCartridgePath(instance, site, cartridge.name));
            });
        }
    });

    return Promise.all(promises);
}

// updates cartridge path on server for one site/cartridge pair
// returns a Promise
function putCartridgePath(instance, site, cartridgeName) {
    const ocapiVersion = ocapi.getOcapiVersion(),
        token = auth.getToken();

    return new Promise((resolve, reject) => {
        const endpoint = `/s/-/dw/data/${ocapiVersion}/sites/${site}/cartridges`,
            options = ocapi.getOptions(instance, endpoint, token);

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
                        console.warn(`Cartridge ${cartridgeName} was already in cartridge path - path was left unchanged.`);
                        resolve();
                    } else {
                        console.error('Error updating cartridge path for site %s and cartridge %s', site, cartridgeName);
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
function readOCAPIPermissions(appDef) {
    const permissions = {
        site: [],
        global: [],
    };

    let promise = Promise.resolve();

    if (appDef.ocapi) {
        if (appDef.ocapi.site) {
            promise = promise.then(() => {
                return Promise.all(appDef.ocapi.site.map(permissionFile => {
                    return readOCAPIFile(path.join(appDef.baseDir, permissionFile));
                }))
                .then(sitePermissionObjs => permissions.site.push(...sitePermissionObjs));
            });
        };

        if (appDef.ocapi.global) {
            promise = promise.then(() => {
                return Promise.all(appDef.ocapi.global.map(permissionFile => {
                    return readOCAPIFile(path.join(appDef.baseDir, permissionFile));
                }))
                .then(globalPermissionObjs => permissions.global.push(...globalPermissionObjs));
            });
        };
    }

    // finally resolve permissions object either way
    return promise
        .then(() => permissions);
}

// reads a single OCAPI permissions file
// returns a promise with contents of JSON file as an object
function readOCAPIFile(permissionFile) {
    const versionErr = `OCAPI Permission file ${permissionFile} version must be at least ${MIN_OCAPI_JSON_VERSION}`,
          missingErr = `OCAPI Permission file ${permissionFile} not found`;

    return fse.pathExists(permissionFile)
        .then(function(exists) {
            if (exists) {
                return fse.readJson(permissionFile)
                    .then(permissionObj => {
                        if (!permissionObj._v || permissionObj._v < MIN_OCAPI_JSON_VERSION) {
                            throw new Error(versionErr);
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
function addOCAPIPermissions(instance, sites, permissions) {
    const promises = [];

    if (permissions.global) {
        permissions.global.forEach(permissionObj =>
            promises.push(patchOCAPIPermissions(instance, permissionObj)));
    }

    if (permissions.site) {
        sites.forEach(site => {
            permissions.site.forEach(permissionObj =>
                promises.push(patchOCAPIPermissions(instance, permissionObj, site)));
        });
    }

    return Promise.all(promises);
}

// updates cartridge path on server for one site/cartridge pair
// returns a Promise
// adds OCAPI permissions for a single clientID and either global or site context
// if site is null/undefined then global context is assumed
function patchOCAPIPermissions(instance, permissionObj, site) {
    const ocapiVersion = ocapi.getOcapiVersion(),
        token = auth.getToken();

    return new Promise((resolve, reject) => {
        const endpoint = `/s/-/dw/data/${ocapiVersion}/sites/${site}/OCAPI_PERMISSIONS`,
            options = ocapi.getOptions(instance, endpoint, token);

            options.body = {
                PERM_OBJ: permissionObj,
            };

            request.patch(options, (err, res) => {
                if (err) {
                    console.error('Error updating OCAPI permissions for site %s', site);
                    reject(err);
                } else if (res.body && res.body.fault) {
                    console.error('Error updating OCAPI permissions for site %s', site);
                    reject(new Error(res.body.fault.type + ': ' + res.body.fault.message));
                }
                resolve();
            });
        });
}


// zipFile is optional
function cleanUp(directory, zipFile) {
    fsUtils.recursiveRmDir(directory);
    if (zipFile) {
        fse.unlinkSync(zipFile);
    }
}

module.exports.getApp = getApp;
module.exports.install = install;

// exported for unit testing
module.exports.testing = {
    getBusinessObjectFilePath,
    readOCAPIPermissions,
};
