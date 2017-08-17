var request = require('superagent');
var job = require('./job');

function site(instance, file_name) {
    job.run(instance, 'sfcc-site-archive-import', {
        file_name : file_name
    });
}

module.exports.site = site;