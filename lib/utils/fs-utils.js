const path = require('path');

const fse = require('fs-extra'),
    zipFolder = require('zip-folder');

/**
 * Recursively remove a directory and all of its contents (similar to rm -r)
 *
 * TAKE CARE when calling this because there is only basic error checking!
 *
 * @param {String} pathToDelete
 */
function recursiveRmDir(pathToDelete) {
    if (pathToDelete === '/') {
        throw new Error('do not delete /');
    }

    var files = [];
    if (fse.existsSync(pathToDelete)) {
        files = fse.readdirSync(pathToDelete);
        files.forEach(function(file,index) {
            var curPath = path.join(pathToDelete, file);
            if (fse.lstatSync(curPath).isDirectory()) {
                recursiveRmDir(curPath);
            } else {
                fse.unlinkSync(curPath);
            }
        });
        fse.rmdirSync(pathToDelete);
    } else {
        throw new Error(`Directory ${pathToDelete} does not exist!`);
    }
};

/**
 * Zips the given directory, creating a file at the same level
 *
 * @param {String} directory
 * @param {String} suffix - optional file suffix (will be ".zip" if not provided)
 * @return {Promise<String>} path to newly created zip archive
 */
function zipDirectory(directory, suffix) {
    if (!suffix) {
        suffix = '.zip';
    }
    const zipFile = `${directory}${suffix}`;

    return new Promise((resolve, reject) => {
        if (!fse.existsSync(directory)) {
            reject(new Error(`Directory ${directory} does not exist!`));
        } else {
            zipFolder(directory, zipFile, function(err) {
                if (err) {
                    reject(`Error zipping import directory: ${err}`);
                } else {
                    resolve(zipFile);
                }
            });
        }
    });
}

module.exports = {
    recursiveRmDir,
    zipDirectory,
};