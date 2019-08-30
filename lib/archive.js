
var fs = require('fs');
var archiver = require('archiver');

/**
     * Archives the given folder to a zip
     *
     * @param {String} target the target zip
     * @param {String} source the source folder
    */
function archive(target, source) {
	// check parameters
	if (typeof (target) !== 'string') {
		throw new TypeError('Parameter target missing or not of type String');
	}
	if (typeof (source) !== 'string') {
		throw new TypeError('Parameter source missing or not of type String');
	}

	// check if source folder exists locally
	if (!fs.existsSync(source)) {
		console.error('Folder "%s" does not exist', source);
		return;
	} else {
		var stat = fs.statSync(source);
		if (!stat.isDirectory()) {
			console.error('Folder "%s" does not exist or is not a folder', source);
			return;
		}
	}

	var output = fs.createWriteStream(target);
	var archive = archiver('zip');

	output.on('close', function () {
		console.log(archive.pointer() + ' total bytes');
		console.log('archiver has been finalized and the output file descriptor has closed.');
	});

	output.on('end', function () {
		console.log('Data has been drained');
	});

	archive.on('warning', function (err) {
		if (err.code === 'ENOENT') {
			console.log('WARNING:', err);
		} else {
			throw err;
		}
	});

	archive.on('error', function (err) {
		throw err;
	});

	archive.pipe(output);

	let folderName = target.substr(0, target.lastIndexOf('.')) || target;

	archive.directory(source, folderName);

	archive.finalize();

	// check if target file is created
	if (!fs.existsSync(target)) {
		console.error('File "%s" does not exist', target);
		return;
	} else {
		var stat = fs.statSync(target);
		if (!stat.isFile()) {
			console.error('File "%s" does not exist or is not a file', target);
			return;
		}
	}
}

module.exports.archive = archive;
