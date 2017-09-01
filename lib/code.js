var request = require('superagent');

var auth = require('./auth');
var ocapi = require('./ocapi');

function activate(instance, code_version) {
    // progress
    var spinner = new require('cli-spinner').Spinner('Processing... %s')
    spinner.start();

    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/{code_version_id}'
    endpoint = endpoint.replace('{code_version_id}', code_version);

    request
        .patch('https://' + instance + endpoint)
        .set('Authorization', 'Bearer ' + auth.getToken())
        .send({active:true})
        .end(function (err, res) {
            spinner.stop(true);
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 && !res.fault) {
                    console.log('Custom code version "%s" successfully activated on instance "%s"',
                        code_version, instance);
                } else {
                    console.error('Error: Activating custom code version "%s" on instance "%s" has failed: %s (%s)',
                        code_version, instance, res.body.fault.type, res.body.fault.message);
                }
            }, function() {
                activate(instance, code_version);
            });
        });
}

module.exports.activate = activate;