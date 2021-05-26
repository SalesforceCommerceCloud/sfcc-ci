/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var fs = require('fs');
var path = require('path');
var request = require('request');

var auth = require('./auth');
var console = require('./log');
var manifest = require('./manifest');
var ocapi = require('./ocapi');
var webdav = require('./webdav');

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

/**
 * Activates a custom code version on an instance.
 *
 * @param {String} instance instance to activate the code versions on
 * @param {String} version the code version to activate
 * @param {String} token oauth token
 * @param {Function} callback callback function to execute
 */
function activateVersion(instance, version, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/' + version;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token, 'PATCH');

    // the patch body
    options['body'] = { active : true };

    // just do the request and pass the callback
    request(options, callback);
}

/**
 * Retrieves a list of all code versions from an instance.
 *
 * @param {String} instance instance to retrieve code versions from
 * @param {String} token oauth token
 * @param {Function} callback callback function to execute
 */
function getVersions(instance, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions'

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);

    // just do the request and pass the callback
    request.get(options, callback);
}

/**
 * Get the source code version on the given instance based on the given code version name.
 * If no code version name is provided, the active code version is used
 *
 * @param {String} instance The instance from which to get the active code version details
 * @param {String} codeVersionName The code version name to return
 *
 * @returns {Promise} A Promise
 * @resolve {String} The code version object retrieved from OCAPI
 * @reject {String} An error message if the process failed
 */
function getSourceCodeVersion(instance, codeVersionName) {
    return new Promise((resolve, reject) => {
        getVersions(instance, auth.getToken(), function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200) {
                    const foundCodeVersion = res.body.data
                        .filter(codeVersion => codeVersion._type === 'code_version')
                        .find(codeVersion => codeVersionName ?
                            codeVersion.id === codeVersionName : codeVersion.active === true);

                    resolve(foundCodeVersion);
                    return;
                }

                // in case of errors
                var result = { error : 'Cannot read code versions', fault : res.body.fault };
                reject(`${result['error']}, ${result['fault']}`);
            }, function() {
                getSourceCodeVersion(instance, codeVersionName)
                    .then(codeVersion => resolve(codeVersion))
                    .catch(err => reject(err));
            });
        });
    });
}

/**
 * Renders a list of code versions in human readable way and writes output to the console.
 *
 * @param {Array} code_versions List of code versions to render
 */
function renderCodeVersions(code_versions) {
    // render totals
    console.info("Number of code versions: %s", code_versions.total);

    // render some details for each
    if (code_versions.total > 0) {
        var data = [['ID','Activation Time','Active','Compatibility Mode','Last Modification Time','Total Size']];
        for (var c of code_versions.data) {
            data.push([c.id,c.activation_time,c.active,c.compatibility_mode,c.last_modification_time,c.total_size]);
        }

        console.table(data);
    }
}

/**
 * Deploys a new code version to an instance.
 *
 * @param {String} instance The instance to deploy code to
 * @param {String} archive The path to the ZIP archive to deploy
 * @param {String} token oauth token
 * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
 * @param {Function} callback Callback function to execute, with the error as parameter passed
 */
function deployCode(instance, archive, token, options, callback) {
    // check parameters
    if (typeof(instance) !== 'string') {
        throw new TypeError('Parameter instance is missing or not of type String');
    }
    if (typeof(archive) !== 'string') {
        throw new TypeError('Parameter archive is missing or not of type String');
    }
    if (typeof(token) !== 'string') {
        throw new TypeError('Parameter token is missing or not of type String');
    }
    if (typeof(options) !== 'object') {
        options = {};
    }
    if (typeof(callback) !== 'function') {
        throw new TypeError('Parameter callback is missing or not of type Function');
    }

    var file = archive;

    // check if file exists locally
    if (!fs.existsSync(file)) {
        callback(new Error(`File "${file}" does not exist`));
        return;
    } else {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
            callback(new Error(`File "${file}" does not exist or is not a file`));
            return;
        }
    }

    // by default we do not ignore local file paths for code upload
    // this will acknowledge any dirs and sub dirs and will retain them
    // when deploying code onto the server (e.g. it will create those dirs
    // and sub dirs if they do not exist)
    var ignoreLocalFilePath = false;
    // however, if we upload a zipped custom code file, we ignore the local
    // path forcing the zip file to be uploaded to the webdav code repo as is
    if (require('path').extname(file) === '.zip') {
        ignoreLocalFilePath = true;
    }

    // initiate the post request first...
    webdav.postFile(instance, webdav.WEBDAV_CODE, file, token, ignoreLocalFilePath, options, function (err, res, body) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
            if (res && res.statusCode >= 400) {
                callback(new Error(`Deploy code ${file} failed (upload step): `
                    + `${res.statusCode} (${res.statusMessage})`));
                return;
            } else if (err) {
                callback(new Error(`Deploy code ${file} failed (upload step): ${err}`));
                return;
            }
            // ...and unzip the archive afterwards
            webdav.unzip(instance, webdav.WEBDAV_CODE, file, token, ignoreLocalFilePath, options,
                function (err, res, body) {
                    // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
                    if (res && res.statusCode >= 400) {
                        callback(new Error(`Deploy code ${file} failed (unzip step): `
                            + `${res.statusCode} (${res.statusMessage})`));
                        return;
                    } else if (err) {
                        callback(new Error(`Deploy code ${file} failed (unzip step): ${err}`));
                        return;
                    }

                    // this assumes that archive file carries the same name as the packaged code version
                    var newVersion = require('path').basename(file);
                    if (ignoreLocalFilePath) {
                        newVersion = require('path').basename(file, '.zip');
                    }

                    // If the code is successfully deployed, we need to remove the uploaded ZIP file
                    webdav.deleteFile(instance, webdav.WEBDAV_CODE, file, token, ignoreLocalFilePath, options,
                        function(err, res, body) {
                            if (err) {
                                callback(new Error(`Delete ZIP file ${file} after deployment `
                                    + `failed (deleteFile step): ${err}`));
                                return;
                            } else {
                                if (res && res.statusCode === 204) {
                                    callback(undefined, newVersion);
                                    return;
                                } else {
                                    callback(new Error(`Delete ZIP file ${file} after deployment failed
                                        (deleteFile step): ${res.statusCode} (${res.statusMessage})`));
                                }
                            }
                        });
                });
        }, function() {
            deployCode(instance, archive, token, options, callback);
        });
    });
}

/**
 * Post a given file to the given instance
 *
 * @param {String} instance The instance to deploy the file to
 * @param {String} codeVersionName The code version target where to deploy the file
 * @param {Object} filePath The path of the file to post
 * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
 *
 * @returns {Promise} A promise
 * @resolve {Object} The reponse from the instance
 * @reject {String} An error message if the process failed
 */
function postFileToInstance(instance, codeVersionName, filePath, options) {
    return new Promise((resolve, reject) => {
        const removePath = path.join(
            'Cartridges',
            codeVersionName,
            filePath.replace(path.basename(filePath), '')
        );

        webdav.postFile(
            instance,
            removePath,
            fileObj.filePath,
            auth.getToken(),
            true,
            options,
            (err, res) => {
                ocapi.ensureValidToken(err, res, function(err, res) {
                    // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
                    if (res && res.statusCode >= 400) {
                        reject(`Post file "${filePath}" failed: ${res.statusCode} (${res.statusMessage})`);
                        return;
                    } else if (err) {
                        reject(`Post file "${filePath}" failed: ${err}`);
                        return;
                    }

                    resolve(res);
                }, function() {
                    postFileFromInstance(instance, codeVersionName, filePath, options)
                        .then(res => resolve(res))
                        .catch(err => reject(err));
                });
            }
        );
    });
}

/**
 * Remove a given file from the given instance
 *
 * @param {String} instance The instance to deploy the file to
 * @param {String} codeVersionName The code version target where to deploy the file
 * @param {Object} filePath The path of the file to remove
 * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
 *
 * @returns {Promise} A promise
 * @resolve {Object} The reponse from the instance
 * @reject {String} An error message if the process failed
 */
function removeFileFromInstance(instance, codeVersionName, filePath, options) {
    return new Promise((resolve, reject) => {
        const removePath = path.join(
            'Cartridges',
            codeVersionName,
            filePath.replace(path.basename(filePath), '')
        );

        webdav.deleteFile(
            instance,
            removePath,
            filePath,
            auth.getToken(),
            true,
            options,
            (err, res) => {
                ocapi.ensureValidToken(err, res, function(err, res) {
                    // note, server respond with a 401 (Authorization required) in case the WebDAV Client permission is not set
                    if (res && res.statusCode >= 400) {
                        reject(`Remove file "${filePath}" failed: ${res.statusCode} (${res.statusMessage})`);
                        return;
                    } else if (err) {
                        reject(`Remove file "${filePath}" failed: ${err}`);
                        return;
                    }

                    resolve(res);
                }, function() {
                    removeFileFromInstance(instance, codeVersionName, filePath, options)
                        .then(res => resolve(res))
                        .catch(err => reject(err));
                });
            }
        );
    });
}

/**
 * Deletes an existing code version
 *
 * @param {String} instance the instance to delete the code version from
 * @param {String} version the code version to delete
 * @param {Function} callback the callback to execute, the error is available as argument to the callback function
 */
function deleteCodeVersion(instance, version, callback) {
    // build the request options
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/' + version;

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, auth.getToken(), 'DELETE');

    // do the request
    request(options, function (err, res, body) {
        var errback = ocapi.captureCommonErrors(err, res);
        if ( errback ) {
            callback(errback, []);
            return;
        } else if ( err ) {
            callback(new Error(`Deleting code version ${version} failed: ${err}`));
            return;
        } else if (res.statusCode >= 400) {
            callback(new Error(`Deleting code version ${version} failed: ${res.statusCode}`));
            return;
        }
        // do the callback without error
        callback(undefined);
    });
}

module.exports.cli = {
    /**
     * Returns a list of all code version on the instance.
     *
     * @param {String} instance the instance to retrieve the list of code versions from
     * @param {Boolean} asJson whether to format the output as json, default is false
     * @param {String} sortBy the field to sort code versions by
     */
    list : function (instance, asJson, sortBy) {
        getVersions(instance, auth.getToken(), function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200) {
                    // apply sorting
                    if (sortBy) {
                        res.body.data = require('./json').sort(res.body.data, sortBy);
                    }
                    if (asJson) {
                        console.json(res.body);
                        return;
                    }
                    renderCodeVersions(res.body);
                    return;
                }
                // in case of errors
                var result = { error : 'Cannot read code versions', fault : res.body.fault };

                if (asJson) {
                    console.json(result);
                    return;
                }
                console.error(result['error']);
                console.debug(result['fault']);
            }, function() {
                list(instance, asJson, sortby);
            });
        });
    },

    /**
     * Deploys a new code version to an instance with optional code activation.
     *
     * @param {String} instance The instance to deploy code to
     * @param {String} archive The path to the ZIP archive to deploy
     * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
     * @param {Boolean} activate Whether to activate the uploaded code version or not, false by default
     */
    deploy : function (instance, archive, options, activate) {
        deployCode(instance, archive, auth.getToken(), options, function(err, newVersion) {
            if (err) {
                console.error(err.message);
            } else if (!activate) {
                console.info('Code archive %s successfully deployed to %s. You may activate the code by running ' +
                    '`sfcc-ci code:activate %s -i %s`.', archive, instance, newVersion, instance);
            } else {
                console.info('Code archive %s successfully deployed to %s.', archive, instance);
            }
            // optionally activate
            if (!err && activate) {
                // check for "cert." version of host name and patch if needed for subsequent code activation step
                if (instance.indexOf('cert.', 0) === 0) {
                    instance = instance.substring(5);
                    console.debug(`Cert host name detected. Using ${instance} for code activation.`);
                }
                module.exports.cli.activate(instance, newVersion);
            }
        });
    },

    /**
     * Activate the custom code version on an instance.
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} code_version The code version to activate
     */
    activate : function (instance, code_version) {
        return new Promise((resolve, reject) => {
            activateVersion(instance, code_version, auth.getToken(), (e, r) => {
                ocapi.ensureValidToken(e, r, (err, res) => {
                    if (!err && res.statusCode == 200 && !res.fault) {
                        console.info('Code version %s activated on %s',
                            code_version, instance);
                        resolve(undefined);
                    } else if (res && res.body && res.body.fault &&
                        res.body.fault.type == 'CodeVersionModificationException') {
                        console.warn('Code version %s already active on %s',
                            code_version, instance);
                        resolve(undefined);
                    } else {
                        console.error('Activating code version %s on %s failed: %s (%s)',
                            code_version, instance, res.body.fault.type, res.body.fault.message);
                        reject(`Activating code version ${code_version} on ${instance} failed: ` +
                            `res.body.fault.type (res.body.fault.message)`);
                    }
                }, () => {
                    module.exports.cli.activate(instance, code_version)
                        .then(() => resolve(undefined))
                        .catch(err => reject(err));
                });
            });
        });
    },

    /**
     * Delete a code version
     *
     * @param {String} instance the instance to delete the code version from
     * @param {String} version the code version to delete
     * @param {Boolean} asJson optional flag to force output in json, false by default
     */
    delete : function(instance, version, asJson) {
        deleteCodeVersion(instance, version, function(err) {
            if (err) {
                if (asJson) {
                    console.json({error: err.message});
                } else {
                    console.error(err.message);
                }
                return;
            }

            // the result
            var result = {
                message : `Code version ${version} deleted from ${instance}.`,
            };

            if (asJson) {
                console.json(result);
                return;
            }

            console.info(result['message']);
        });
    },

    /**
     * This method is the entry point of the code compare task
     * It performs the following steps in order to view the diff between the remote instance and the local folders
     *
     * Steps:
     * 1. Get the active code version (if it does not exist or there is an issue while connecting, abort)
     * 2. Download the manifest file from the code version (if it does not exist, abort)
     * 3. Generate a local manifest (if there is any issue finding files, abort)
     * 4. Compare the remove and local manifests and display data into the console
     * 5. Remove the manifests files (if --removeafter option is passed)
     *
     * @param {String} instance The instance to compare with the local directory
     * @param {String|Array} localDirectories The local directory paths to compare with the remote's active code version.
     * Each path has to contain the "cartridges" folder from which the tool will lookup for files to compare with the remote instance
     * @param {Object} options The options to use within the request and to control few behaviors
     *
     * @returns {Promise} A promise
     * @resolve {String} The full path of the newly created results output file or undefined if the option outputFile is not passed
     * @reject {String} An error message if the process failed
     */
    compare : function (instance, localDirectories, options) {
        return new Promise(async (resolve, reject) => {
            try {
                options.verbose && console.log(`Starting the compare process between the "${localDirectories}" local ` +
                    `directories and the active code version of "${instance}".`);

                if (typeof(localDirectories) === 'string') {
                    localDirectories = localDirectories.split(',');
                }

                // First, ensure all the local directories exist and contain a "cartridges" folder at their root level
                const arelocalDirectoriesValid = localDirectories.every(localDirectory => {
                    return fs.existsSync(localDirectory) && fs.existsSync(path.join(localDirectory, 'cartridges'));
                });
                if (!arelocalDirectoriesValid) {
                    reject('One or all the local directories don\'t exist ' +
                        'or don\'t contain a "cartridges" folder at their root.');
                    return;
                }

                options.verbose && console.success('✓ All the local directories are valid.');

                // #1
                let sourceCodeVersion = await getSourceCodeVersion(instance, options.sourceCodeVersion);
                options.verbose && console.success(`✓ The "${sourceCodeVersion.id}" active code version ` +
                    `has been retrieved from "${instance}".`);

                // #2
                const manifestRemotePath = path.join(
                    webdav.WEBDAV_CODE,
                    sourceCodeVersion.id,
                    options.manifestFileName || manifest.FILENAME
                );
                const manifestName = `${sourceCodeVersion.id}_${manifest.FILENAME}`;
                const downloadManifestTargetPath = path.join(process.cwd(), manifestName);
                options.verbose && console.log(`Downloading the remote manifest "${manifestRemotePath}" ` +
                    `from "${instance}" into "${downloadManifestTargetPath}".`);
                await webdav.downloadFile(
                    instance,
                    manifestRemotePath,
                    auth.getToken(),
                    downloadManifestTargetPath,
                    options
                );
                options.verbose && console.success(`✓ Remote manifest "${manifestRemotePath}" successfully ` +
                    `downloaded into "${downloadManifestTargetPath}".`);

                // #3
                options.verbose && console.log('Generating the local manifest based on the given local directories.');
                let ignorePatterns = options.ignorePatterns;
                if (options.ignorePatterns && typeof(options.ignorePatterns) === 'string') {
                    ignorePatterns = options.ignorePatterns.split(',');
                }
                const localManifestPath = await manifest.generate(
                    localDirectories,
                    ignorePatterns,
                    process.cwd(),
                    `local_${manifest.FILENAME}`
                );
                options.verbose && console.success(`✓ Local manifest "${localManifestPath}" ` +
                    `successfully generated.`);

                // #4
                options.verbose && console.log(`Comparing the local manifest "${localManifestPath}" ` +
                    `with the previously downloaded remote one "${downloadManifestTargetPath}".`);
                const deltaOrResultsPath = await manifest.compareAndRenderResult(
                    localManifestPath,
                    downloadManifestTargetPath,
                    sourceCodeVersion.id,
                    options
                );
                options.verbose && console.success('✓ Done comparing manifests.');

                // #5
                if (options.removeFilesAfter) {
                    options.verbose && console.log('Removing manifests file as the "removeafter" ' +
                        'option has been sent.');
                    await manifest.remove(localManifestPath);
                    await manifest.remove(downloadManifestTargetPath);
                    options.verbose && console.success('✓ Manifests successfully removed.');
                }

                options.verbose && console.success(`✓ Code comparison done.${options.outputFile ?
                    ` Please see the results in the "${deltaOrResultsPath}" file.` : ''}`);
                resolve(deltaOrResultsPath);
            } catch (e) {
                reject(e);
            }
        });
    },

    /**
     * This method is the entry point of the code diff-deployment task
     * It performs the following steps in order to deploy only the changed files between the local and the remote instance
     *
     * Steps:
     * 1. Get the active code version (if it does not exist or there is an issue while connecting, abort)
     * 2. Download the manifest file from the code version (if it does not exist, abort)
     * 3. Generate a local manifest, which represents the state of the local files (if there is any issue finding files, abort)
     * 4. Compare both manifests, and keep track of the changed files. If no files are changed, end the process
     * 5. Copy the remote code version in a new folder, named with the codeversion parameter.
     * 6. Generate a ZIP file which contain all the files which changed or have been added. This will improve the performance by uploading the zip file directly and unzipping it.
     * A DELETE request will be triggered for each removed file, as these ones cannot be part of the ZIP file.
     * 7. Activate the newly generated code version on the instance, if the activate option is passed.
     * 8. Remote the manifest files after the process if the removeafter option is passed.
     *
     * @param {String} instance The instance to compare with the local directory
     * @param {String|Array} localDirectories The local directory paths to compare with the remote's active code version.
     * Each path has to contain the "cartridges" folder from which the tool will lookup for files to compare with the remote instance
     * @param {String} codeVersionName The name of the newly generated code version
     * @param {Object} options The options to use within the request and to control few behaviors
     * @param {Boolean} activate Whether to activate the uploaded code version or not, false by default
     *
     * @returns {Promise} A promise
     * @resolve {undefined} undefined, meaning that everything worked well
     * @reject {String} An error message if the process failed
     */
    diffdeploy : function (instance, localDirectories, codeVersionName, options, activate) {
        return new Promise(async (resolve, reject) => {
            try {
                options.verbose && console.log(`Starting the diff-deployment process between ` +
                    `the "${localDirectories}" local directories and the active code version of "${instance}".`);

                if (typeof(localDirectories) === 'string') {
                    localDirectories = localDirectories.split(',');
                }

                // First, ensure all the local directories exist and contain a "cartridges" folder at their root level
                const arelocalDirectoriesValid = localDirectories.every(localDirectory => {
                    return fs.existsSync(localDirectory) && fs.existsSync(path.join(localDirectory, 'cartridges'));
                });
                if (!arelocalDirectoriesValid) {
                    reject('One or all the local directories don\'t exist ' +
                        'or don\'t contain a "cartridges" folder at their root.');
                    return;
                }

                options.verbose && console.success('✓ All the local directories are valid.');

                // #1
                let sourceCodeVersion = await getSourceCodeVersion(instance, options.sourceCodeVersion);
                options.verbose && console.success(`✓ The "${sourceCodeVersion.id}" active code version ` +
                    `has been retrieved from "${instance}".`);

                // #2
                const manifestRemotePath = path.join(
                    webdav.WEBDAV_CODE,
                    sourceCodeVersion.id,
                    options.manifestFileName || manifest.FILENAME
                );
                const manifestName = `${sourceCodeVersion.id}_${manifest.FILENAME}`;
                const downloadManifestTargetPath = path.join(process.cwd(), manifestName);
                options.verbose && console.log(`Downloading the remote manifest "${manifestRemotePath}" ` +
                    `from "${instance}" into "${downloadManifestTargetPath}".`);
                await webdav.downloadFile(
                    instance,
                    manifestRemotePath,
                    auth.getToken(),
                    downloadManifestTargetPath,
                    options
                );
                options.verbose && console.success(`✓ Remote manifest "${manifestRemotePath}" successfully ` +
                    `downloaded into "${downloadManifestTargetPath}".`);

                // #3
                options.verbose && console.log('Generating the local manifest based on the given local directories.');
                let ignorePatterns = options.ignorePatterns;
                if (options.ignorePatterns && typeof(options.ignorePatterns) === 'string') {
                    ignorePatterns = options.ignorePatterns.split(',');
                }
                const localManifestPath = await manifest.generate(
                    localDirectories,
                    ignorePatterns,
                    process.cwd(),
                    `${manifest.FILENAME}`
                );
                options.verbose && console.success(`✓ Local manifest "${localManifestPath}" ` +
                    `successfully generated.`);

                // #4
                options.verbose && console.log(`Comparing the local manifest "${localManifestPath}" ` +
                    `with the previously downloaded remote one "${downloadManifestTargetPath}".`);
                let forceDeployPatterns = options.forceDeployPatterns;
                if (options.forceDeployPatterns && typeof(options.forceDeployPatterns) === 'string') {
                    forceDeployPatterns = options.forceDeployPatterns.split(',');
                }
                const delta = await manifest.compareAndAggregateResults(
                    localDirectories,
                    forceDeployPatterns,
                    localManifestPath,
                    downloadManifestTargetPath
                );
                options.verbose && console.success('✓ Done comparing manifests.');

                // If the delta is empty (meaning both local and remote manifests contain the same data), then abort
                if (!delta || (delta.added.length === 0 && delta.changed.length === 0 && delta.removed.length === 0)) {
                    options.verbose && console.success('There is no difference between the local files ' +
                        'and the remote active code version. Aborting.');

                    if (options.removeFilesAfter) {
                        options.verbose && console.log('Removing manifests file as the "removeafter" ' +
                            'option has been sent.');
                        await manifest.remove(localManifestPath);
                        await manifest.remove(downloadManifestTargetPath);
                        options.verbose && console.success('✓ Manifests successfully removed.');
                    }

                    resolve(undefined);
                    return;
                }

                // #5
                const sourcePath = path.join(webdav.WEBDAV_CODE, sourceCodeVersion.id);
                const destinationPath = path.join(webdav.WEBDAV_CODE, codeVersionName);
                await webdav.copy(instance, sourcePath, destinationPath, auth.getToken(), options);

                // #6
                // If there is no added nor changed files, then don't generate the ZIP archive
                if (delta.added.length > 0 || delta.changed.length > 0) {
                    options.verbose && console.log('Generating the archive which contains the ' +
                        'added and changed files, and the local manifest file.');

                    const partialArchivePath = await manifest.generatePartialArchive(
                        codeVersionName,
                        delta.added,
                        delta.changed,
                        localManifestPath
                    );
                    options.verbose && console.success('✓ Archive successfully generated.');

                    // Upload/Unzip/Remove the ZIP file to the instance
                    await new Promise((resolve, reject) => {
                        options.verbose && console.log('Deploying the archive to the remote instance.');
                        deployCode(instance, partialArchivePath, auth.getToken(), options,
                            (err, res) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }

                                options.verbose && console.success('✓ Archive successfully deployed.');
                                resolve(res);
                            });
                    });
                } else {
                    // If there is no need for a partial archive, only upload the new manifest, this means that we only have to remove files from the remote instance
                    await new Promise(async (resolve, reject) => {
                        options.verbose && console.log('Deploying the new manifest file to the instance.');
                        await postFileToInstance(instance, codeVersionName, localManifestPath, options);
                        options.verbose && console.success('✓ Manifest successfully deployed.');
                    });
                }

                // Add the removed files
                delta.removed.map(async (fileObj) => {
                    await removeFileFromInstance(instance, codeVersionName, fileObj.fullPath, options);
                });

                options.verbose && console.success('✓ Done uploading files to the remote instance.');

                // #7
                if (activate) {
                    // check for "cert." version of host name and patch if needed for subsequent code activation step
                    if (instance.indexOf('cert.', 0) === 0) {
                        instance = instance.substring(5);
                        console.debug(`Cert host name detected. Using ${instance} for code activation.`);
                    }
                    options.verbose && console.log(`Activating the newly created ${codeVersionName} code version.`);
                    await module.exports.cli.activate(instance, codeVersionName);
                    options.verbose && console.success('✓ Done activating the code version.');
                }

                // #8
                if (options.removeFilesAfter) {
                    options.verbose && console.log('Removing manifests file as the "removeafter" ' +
                        'option has been sent.');
                    await manifest.remove(localManifestPath);
                    await manifest.remove(downloadManifestTargetPath);
                    options.verbose && console.success('✓ Manifests successfully removed.');
                }

                options.verbose && console.success(`✓ Differential code deployment done.
    ✓ ${delta.added.length} files added
    ✓ ${delta.changed.length} files changed
    ✓ ${delta.removed.length} files removed`);

                resolve(undefined);
            } catch (e) {
                reject(e);
            }
        });
    }
};

module.exports.api = {
    /**
     * Get all custom code versions deployed on a Commerce Cloud instance.
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The error and the code versions will be passed as parameters to the callback function.
     */
    list : function (instance, token, callback) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance is missing or not of type String');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token is missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback is missing or not of type Function');
        }
        getVersions(instance, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 && !res.fault) {
                    // Success
                    callback(undefined, res.body);
                    return;
                }

                // any errors
                callback(new Error(err), undefined);
                return;
            });
        });
    },

    /**
     * Deploys a custom code archive onto a Commerce Cloud instance
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} archive The path to the ZIP archive to deploy
     * @param {String} token The Oauth token to use for authentication
     * @param {Object} options The options parameter can contains client certificate buffer and related passphrase in case of two factor authentication
     * @param {Function} callback Callback function executed as a result. The error will be passed as parameter to the callback function.
     */
    deploy: function (instance, archive, token, options, callback) {
        deployCode(instance, archive, token, options, callback);
    },

    /**
     * Activate the custom code version on a Commerce Cloud instance. If the code version is already
     * active, no error is available.
     *
     * @param {String} instance The instance to activate the code on
     * @param {String} code_version The code version to activate
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The error will be passed as parameter to the callback function.
     */
    activate : function (instance, code_version, token, callback) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance is missing or not of type String');
        }
        if (typeof(code_version) !== 'string') {
            throw new TypeError('Parameter code_version is missing or not of type String');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token is missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback is missing or not of type Function');
        }
        activateVersion(instance, code_version, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 && !res.fault) {
                    // Success
                    callback(undefined);
                    return;
                } else if (res.statusCode == 400 && res.body.fault.type == 'CodeVersionModificationException') {
                    // Exception: Code version already active won't end up in error
                    callback(undefined);
                    return;
                }

                callback(new Error(err));
                return;
            });
        });
    },

    /**
     * This method is the entry point of the code compare task
     * It performs the following steps in order to view the diff between the remote instance and the local folders
     *
     * Steps:
     * 1. Get the active code version (if it does not exist or there is an issue while connecting, abort)
     * 2. Download the manifest file from the code version (if it does not exist, abort)
     * 3. Generate a local manifest (if there is any issue finding files, abort)
     * 4. Compare the remove and local manifests and display data into the console
     * 5. Remove the manifests files (if --removeafter option is passed)
     *
     * @param {String} instance The instance to compare with the local directory
     * @param {String|Array} localDirectories The local directory paths to compare with the remote's active code version.
     * Each path has to contain the "cartridges" folder from which the tool will lookup for files to compare with the remote instance
     * @param {Object} options The options to use within the request and to control few behaviors
     *
     * @returns {Promise} A promise
     * @resolve {String} The full path of the newly created results output file or undefined if the option outputFile is not passed
     * @reject {String} An error message if the process failed
     */
    compare: module.exports.cli.compare,

    /**
     * This method is the entry point of the code diff-deployment task
     * It performs the following steps in order to deploy only the changed files between the local and the remote instance
     *
     * Steps:
     * 1. Get the active code version (if it does not exist or there is an issue while connecting, abort)
     * 2. Download the manifest file from the code version (if it does not exist, abort)
     * 3. Generate a local manifest, which represents the state of the local files (if there is any issue finding files, abort)
     * 4. Compare both manifests, and keep track of the changed files. If no files are changed, end the process
     * 5. Copy the remote code version in a new folder, named with the codeversion parameter.
     * 6. Generate a ZIP file which contain all the files which changed or have been added. This will improve the performance by uploading the zip file directly and unzipping it.
     * A DELETE request will be triggered for each removed file, as these ones cannot be part of the ZIP file.
     * 7. Activate the newly generated code version on the instance, if the activate option is passed.
     * 8. Remote the manifest files after the process if the removeafter option is passed.
     *
     * @param {String} instance The instance to compare with the local directory
     * @param {String|Array} localDirectories The local directory paths to compare with the remote's active code version.
     * Each path has to contain the "cartridges" folder from which the tool will lookup for files to compare with the remote instance
     * @param {String} codeVersionName The name of the newly generated code version
     * @param {Object} options The options to use within the request and to control few behaviors
     * @param {Boolean} activate Whether to activate the uploaded code version or not, false by default
     *
     * @returns {Promise} A promise
     * @resolve {undefined} undefined, meaning that everything worked well
     * @reject {String} An error message if the process failed
     */
    diffdeploy : module.exports.cli.diffdeploy
};