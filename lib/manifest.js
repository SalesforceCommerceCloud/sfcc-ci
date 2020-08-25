/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
'use strict';

const archiver = require('archiver');
const del = require('del');
const fs = require('fs');
const globby = require('globby');
const jsondiffpatch = require('jsondiffpatch').create({
    arrays: {
        detectMove: false
    }
});
const path = require('path');
const sha1 = require( 'node-sha1' );

const packageJson = require('./../package.json');

/**
 * @type {String}
 */
const FILENAME = 'deployment_manifest.json';
/**
 * @type {Regexp}
 */
const CARTRIDGE_NAME_REGEX = /cartridges\/([a-z_]+)\/cartridge/;
/**
 * @type {Array}
 */
const DEFAULT_IGNORE_PATTERNS = [
    'test/**/*',
    'coverage/**/*',
    'documentation/**/*',
    'docs/**/*',
    '*.md'
];

/**
 * Build the manifest Object that is then saved in the manifest file
 *
 * @param {Array} ignore The list of ignore patterns used while getting files
 * @param {Object} files An Object that represents the list of files found in the directories
 * Where each key is a relative path of the file from the cartridges folder and the value is the checksum of the file
 *
 * @returns {Object} The manifest content
 */
function build(ignore, files) {
    return {
        verstion: packageJson.version,
        timestamp: new Date().getTime(),
        ignore,
        files,
        totalFiles: Object.keys(files).length
    };
}

/**
 * Generates the results output file based on the "code_compare_template.html" file
 *
 * @param {String} codeVersion The code version ID
 * @param {String} local The file path of the local manifest
 * @param {String} remote The file path of the remote manifest
 * @param {String} delta The delta result when comparing two manifest files
 *
 * @returns {Promise} A promise
 * @resolve {String} The results file path
 * @reject {String} An error message if the process failed
 */
function generateResultsFile(codeVersion, local, remote, delta) {
    return new Promise((resolve, reject) => {
        const htmlFilePath = path.join(process.cwd(), `${codeVersion}_code_compare_results.html`)

        fs.readFile(path.join(process.cwd(), 'code_compare_template.html'), 'utf-8', (err, content) => {
            if (err) {
                reject(err);
                return;
            }

            content = content.replace('{{SOURCE}}', local).replace('{{TARGET}}', remote).replace('{{DELTA}}', delta);

            fs.writeFile(htmlFilePath, content, 'utf-8', function (err) {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(htmlFilePath);
            });
        });
    });
}

/**
 * Writes the manifest file on the file system
 *
 * @param {Object} content The content of the manifest
 * @param {String} directory The directory path where to store the manifest file
 * @param {String} filename The manifest file name
 *
 * @returns {Promise} A promise
 * @resolve {String} The full path of the newly created manifest file
 * @reject {String} An error message if the process failed
 */
function write(content, directory, filename) {
    return new Promise((resolve, reject) => {
        if (!content) {
            reject('Empty content to write in the manifest file.');
            return;
        }

        const manifestPath = path.join(directory, filename);

        fs.writeFile(manifestPath, JSON.stringify(content, undefined, 4), (err, res) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(manifestPath);
        });
    });
}

/**
 * Generates the checksum of the given file
 *
 * @param {String} file The path of the file from which to generate the checksum
 *
 * @returns {String} The generated checksum
 */
function generateChecksum(file) {
    const fileBuffer = fs.readFileSync(file);
    return sha1(fileBuffer);
}

/**
 * Compare both local and remote manifests and returns the difference between the two
 *
 * @param {String} local The local manifest path to compare
 * @param {String} remote The remove manifest path to compare (stored locally)
 *
 * @returns {Promise} A promise
 * @resolve {Array} The list of files which have changed between their local version and the remote instance
 * @reject {String} An error message if the process failed
 */
function compare(local, remote) {
    return new Promise((resolve, reject) => {
        try {
            const localManifestContent = JSON.parse(fs.readFileSync(local, {
                encoding:'utf8',
                flag:'r'
            }));
            const remoteManifestContent = JSON.parse(fs.readFileSync(remote, {
                encoding:'utf8',
                flag:'r'
            }));

            resolve(jsondiffpatch.diff(localManifestContent, remoteManifestContent));
        } catch (err) {
            reject (err);
        }
    });
}

/**
 * Compare both local and remote manifests and returns the difference between the two
 *
 * @param {Array} directories The list of directories to look at locally
 * @param {Array} forceDeployPatterns The list of patterns to use to add always-deployable files
 * @param {String} local The local manifest path to compare
 * @param {String} remote The remove manifest path to compare (stored locally)
 *
 * @returns {Promise} A promise
 * @resolve {Array} The list of files which have changed between their local version and the remote instance
 * @reject {String} An error message if the process failed
 */
function compareAndAggregateResults(directories, forceDeployPatterns, local, remote) {
    return new Promise(async (resolve, reject) => {
        const delta = await compare(local, remote).catch(err => reject(err));
        const deltaResults = {
            added: [],
            changed: [],
            removed: []
        };

        if (!delta.files || delta.files.length === 0) {
            resolve(deltaResults);
            return;
        }

        Object.keys(delta.files).forEach(filePath => {
            const fileDelta = delta.files[filePath];
            const fileObj = {
                fileName: path.basename(filePath),
                filePath
            };

            // As we loose the full path of each file while generating the manifest,
            // we have to construct it back to be able to upload them
            directories.some(directory => {
                let p = path.join(directory, 'cartridges', filePath);
                if (fs.existsSync(p)) {
                    fileObj.fullPath = p;
                    return true;
                }

                return false;
            });

            if (fileDelta.length === 2) { // two cheksums found, this means the file changed
                deltaResults.changed.push(fileObj);
            } else if (fileDelta.length === 1) { // Only one checksum found, the file has been removed locally
                deltaResults.removed.push(fileObj);
            } else if (fileDelta.length == 3) { // Three checksum found, the file has been added locally
                deltaResults.added.push(fileObj);
            }
        });

        if (forceDeployPatterns && forceDeployPatterns.length > 0) {
            await (await globby(forceDeployPatterns)).forEach(fullPath => {
                deltaResults.changed.push({
                    fileName: path.basename(fullPath),
                    // Remove the directories paths from the file path,
                    // so that we only have the relative path from the code version
                    filePath: directories.reduce((filepath, directory) =>
                        filepath.replace(path.join(directory, 'cartridges'), ''), fullPath),
                    fullPath
                })
            });
        }

        resolve(deltaResults);
    });
}

/**
 * Compare both local and remote manifests and produces the output based on the received options
 *
 * @param {String} local The local manifest path to compare
 * @param {String} remote The remove manifest path to compare (stored locally)
 * @param {String} codeVersion The code version ID that we are comparing
 * @param {Object} options options from the process input
 *
 * @returns {Promise} A promise
 * @resolve {String} The full path of the newly created results file if options.outputFile is true, or undefined
 * @reject {String} An error message if the process failed
 */
function compareAndRenderResult(local, remote, codeVersion, options) {
    return new Promise(async (resolve, reject) => {
        const delta = await compare(local, remote);
        if (options.outputFile) {
            const localManifestContent = JSON.parse(fs.readFileSync(local, {
                encoding:'utf8',
                flag:'r'
            }));
            const htmlDelta = require('jsondiffpatch').formatters.html.format(delta, localManifestContent);
            generateResultsFile(codeVersion, local, remote, htmlDelta)
                .then(resultsPath => resolve(resultsPath))
                .catch(err => reject(err));
        } else {
            // print the results in the console if the verbose mode is enabled
            options.verbose && jsondiffpatch.console.log(delta);
            resolve(delta);
        }
    });
}

/**
 * Generates the archive which contains all the added and changed files locally + the local manifest file
 *
 * @param {String} codeVersion The code version name to use as archive name
 * @param {Array} addedFiles The list of files added locally
 * @param {Array} changedFiles The list of files changed locally
 * @param {String} manifestPath The path of the local manifest, to include within the archive
 *
 * @returns {Promise} A promise
 * @resolve {String} The full path of the newly created archive
 * @reject {String} An error message if the process failed
 */
function generatePartialArchive(codeVersion, addedFiles, changedFiles, manifestPath) {
    return new Promise(async (resolve, reject) => {
        try {
            // Firstly, create a folder where to store all the files
            // (with a temporary name, goal is to not override any existing folder which might have the code version as name)
            const folderPath = path.join(process.cwd(), `temp_codeversion_${codeVersion}`);
            const archiveTemporaryPath = `${folderPath}.zip`;
            const archivePath = path.join(process.cwd(),`${codeVersion}.zip`);

            // Remove previous folder and archive in case these ones have not been already removed
            await del([folderPath, archivePath]);

            // Move these files in the newly created folder
            addedFiles.forEach(fileObj => {
                const newFilePath = path.join(folderPath, fileObj.filePath);
                fs.mkdirSync(newFilePath.replace(fileObj.fileName, ''), { recursive: true });
                fs.copyFileSync(fileObj.fullPath, newFilePath);
            });
            changedFiles.forEach(fileObj => {
                const newFilePath = path.join(folderPath, fileObj.filePath);
                fs.mkdirSync(newFilePath.replace(fileObj.fileName, ''), { recursive: true });
                fs.copyFileSync(fileObj.fullPath, newFilePath)
            });
            // Also move the manifest at the root level of the folder (which will be at the root level of the archive)
            fs.copyFileSync(manifestPath, path.join(folderPath, path.basename(manifestPath)));

            // Zip the folder
            const archiveOutput = fs.createWriteStream(archiveTemporaryPath);
            const archive = archiver('zip');
            // listen for all archive data to be written
            // 'close' event is fired only when a file descriptor is involved
            archiveOutput.on('close', async () => {
                // Rename the folder with the code version name
                fs.renameSync(archiveTemporaryPath, archivePath);
                // Remove the temporary folder
                await del([folderPath]);
                resolve(archivePath);
            });

            archive.on('error', function(err) {
                throw err;
            });
            archive.pipe(archiveOutput);
            archive.directory(folderPath, codeVersion);
            archive.finalize();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Generates the local manifest file based on the directories list sent in arguments
 *
 * @param {Array} directories The list of directories from where to list files to compare
 * @param {Array} ignorePatterns The ignore patterns list to use while listing files
 * @param {String} targetDirectory The directory where to store the generated file. If not specified, process.cwd() is used
 * @param {String} fileName The name of the file to generate. If not specified, the FILENAME constant is used
 *
 * @returns {Promise} A promise
 * @resolve {String} The full path of the newly created manifest file
 * @reject {String} An error message if the process failed
 */
function generate(directories, ignorePatterns, targetDirectory, fileName) {
    return new Promise(async (resolve, reject) => {
        if (targetDirectory && !fs.existsSync(targetDirectory)) {
            reject(`The specified "${targetDirectory}" directory does not exist.`);
            return;
        }

        let ignore = DEFAULT_IGNORE_PATTERNS;
        if (ignorePatterns && ignorePatterns.length > 0) {
            ignore = ignorePatterns;
        }

        const ignoreAcrossDirectories = directories.reduce((acc, directory) => {
            return acc.concat(ignore.map(ignorePattern => path.join(directory, ignorePattern)));
        }, []);

        const files = await globby(directories.map(directory => path.join(directory, 'cartridges/**/*')), {
            ignore: ignoreAcrossDirectories
        });

        if (!files || files.length === 0) {
            reject('No files have been found in the directories. Abort.');
            return;
        }

        const fileChecksums = {};
        files.forEach(file => {
            // Remove the directories paths from the file path, so that we only have the relative path from the code version
            const relativeFilePath = directories.reduce((filepath, directory) =>
                filepath.replace(path.join(directory, 'cartridges'), ''), file);

            fileChecksums[relativeFilePath] = generateChecksum(file);
        });

        const manifestContent = build(ignore, fileChecksums);
        write(manifestContent, targetDirectory || process.cwd(), fileName || FILENAME)
            .then(manifestPath => resolve(manifestPath))
            .catch(err => reject(err));
    })
}

/**
 * Remove the file which lives in the given file path
 *
 * @param {String} manifestPath The path of the file to remove
 *
 * @returns {Promise} A promise
 * @resolve {String} undefined, meaning everything went well
 * @reject {String} An error message if the process failed
 */
function remove(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            reject(`The "${filePath}" path is invalid.`)
        }

        fs.unlinkSync(filePath);
        resolve(undefined);
    });
}

module.exports = {
    FILENAME,
    compare,
    compareAndAggregateResults,
    compareAndRenderResult,
    generatePartialArchive,
    generate,
    remove,
    api: {
        FILENAME,
        generate
    }
};
