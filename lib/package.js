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
    JOB_STATUS_RETRY_PERIOD = 1000;

// finds & loads a package object
// returns a promise with data loaded from the package file or undefined if not found
// adds a baseDir attribute to package object for dir containing package file
function getPackage(packageFile) {
    if (!packageFile) {
        packageFile = path.join(process.cwd(), 'cc-package.json');
    }
    return fse.pathExists(packageFile)
        .then(function(exists) {
            if (exists) {
                return fse.readJson(packageFile)
                    .then(packageObj => {
                        packageObj.baseDir = path.dirname(packageFile);
                        return packageObj;
                    });
            } else {
                return undefined;
            }
        });
}

// installs an app for the given sites based on package descriptor
function install(instance, packageDef, sites, version) {
    console.info('Installing %s', packageDef.name);

    return uploadCode(packageDef, instance, version)
        .then(() => importSites(instance, packageDef, sites))
        .then(() => updateCartridgePath(instance, packageDef, sites))
        .then(() => console.info('installation complete'))
        .catch(err => {
            console.error('Error during installation: %s', err);
            throw err;
        });
}

// uploads code cartridges listed in package descriptor and return promise
function uploadCode(packageDef, instance, version) {
    const promises = [];

    packageDef.cartridges.forEach(cartridge => {
        const randomId = Math.floor(Math.random() * 999999),
            tmpDir = path.join(TMP_DIR, `cartridge_${randomId}`),
            versionDir = path.join(tmpDir, version),
            appDir = path.join(versionDir, cartridge.name),
            codeArchive = `${tmpDir}.zip`,
            token = auth.getToken();

        fse.mkdirSync(tmpDir);
        fse.mkdirSync(versionDir);
        fse.mkdirSync(appDir);
        promises.push(
            fse.copy(path.join(packageDef.baseDir, cartridge.path), appDir)
                .then(() => fsUtils.zipDirectory(tmpDir))
                .then(() => webdav.deployCodePromise(instance, codeArchive, token, {}))
                .then(() => cleanUp(tmpDir, codeArchive))
                .catch(err => {
                    // make sure cleanup happens either way
                    try {
                        cleanUp(tmpDir, codeArchive);
                    } catch (err2) {
                        // ignore case where dir/archive not created in the first place
                    }
                    throw err;
                })
        );
    });

    return Promise.all(promises);
}

// runs full site import for each site
// only includes global business objects in first site import
// NOTE: site import jobs have to be run serially
function importSites(instance, packageDef, sites) {
    let promise = Promise.resolve();
    sites.forEach((site, index) => {
        const includeGlobal = (index === 0);
        promise = promise.then(() => importSite(instance, packageDef, site, includeGlobal));
    });
    return promise;
}

function importSite(instance, packageDef, site, includeGlobal) {
    const [parentDir, importDir] = createImportDir(),
        importFile = `${parentDir}.zip`,
        importFileName = path.basename(importFile);

    let promise = Promise.resolve(),
        shouldRunImport = false;

    // check if we should add any global business objects
    if (packageDef.businessobjects.global.length > 0 && includeGlobal) {
        promise = addGlobalBusinessObjects(packageDef, importDir, site);
        shouldRunImport = true;
    }

    // check if we should add any site business objects
    if (packageDef.businessobjects.site.length > 0) {
        promise = promise.then(() => addSiteBusinessObjects(packageDef, importDir, site));
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

// loops over site business object files listed in package descriptor
// and adds them into importDir
function addSiteBusinessObjects(packageDef, importDir, site) {
    const promises = [];

    packageDef.businessobjects.site.forEach(busObjFile => {
        const xmlContent = fse.readFileSync(path.join(packageDef.baseDir, busObjFile), 'utf-8'),
            jsContent = xmlJs.xml2js(xmlContent),
            busObjFilePath = getBusinessObjectFilePath(jsContent, site),
            fileName = path.join(importDir, busObjFilePath);

        // fse will create dir if it does not exist
        promises.push(fse.outputFile(fileName, xmlContent));
    });

    // return when all files have been copied into import dir
    return Promise.all(promises);
}

// loops over global business object files listed in package descriptor
// and adds them into importDir
function addGlobalBusinessObjects(packageDef, importDir, site) {
    const promises = [];

    packageDef.businessobjects.global.forEach(busObjFile => {
        const xmlContent = fse.readFileSync(path.join(packageDef.baseDir, busObjFile), 'utf-8'),
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
        pollJob();
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

function updateCartridgePath(instance, packageDef, sites) {
    const promises = [],
        ocapiVersion = 'v1', // TODO use real ocapi versions
        token = auth.getToken();

    sites.forEach(site => {
        packageDef.cartridges.forEach(cartridge => {
            promises.push(new Promise((resolve, reject) => {
                const endpoint = `/s/-/dw/data/${ocapiVersion}/sites/${site}/addcartridge/${cartridge.name}`,
                    options = ocapi.getOptions(instance, endpoint, token);

                request.put(options, (err, res) => {
                    if (err) {
                        console.error('Error updating cartridge path for %s', cartridge.name);
                        reject(err);
                    }
                    resolve();
                });

            }));
        });
    });

    return Promise.all(promises);
}

// zipFile is optional
function cleanUp(directory, zipFile) {
    fsUtils.recursiveRmDir(directory);
    if (zipFile) {
        fse.unlinkSync(zipFile);
    }
}

module.exports.getPackage = getPackage;
module.exports.install = install;

// exported for unit testing
module.exports.testing = {
    getBusinessObjectFilePath,
};