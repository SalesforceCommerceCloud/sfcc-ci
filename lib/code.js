var request = require('superagent');

var auth = require('./auth');
var ocapi = require('./ocapi');

function activateVersion(instance, code_version, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/code_versions/{code_version_id}'
    endpoint = endpoint.replace('{code_version_id}', code_version);

    request
        .patch('https://' + instance + endpoint)
        .set('Authorization', 'Bearer ' + token)
        .send({active:true})
        .end(callback);
}

function activate(instance, code_version) {
    // progress
    var spinner = new require('cli-spinner').Spinner('Processing... %s')
    spinner.start();

    activateVersion(instance, code_version, auth.getToken(), function (err, res) {
        spinner.stop(true);
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200 && !res.fault) {
                console.log('Custom code version "%s" successfully activated on instance "%s"',
                    code_version, instance);
            } else if (res.body.fault.type == 'CodeVersionModificationException') {
                console.log('Custom code version "%s" already activate on instance "%s"',
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
module.exports.api = {
    /**
     * Activate the custom code version on a Commerce Cloud instance. You may pass an optional 
     * success and error callback function to further handle success.
     * 
     * @param {String} instance The instance to activate the code on
     * @param {String} code_version The code version to activate
     * @param {String} token The Oauth token to use use for authentication
     * @param {Function} success Callback function executed when the code activation succeeded.
     * @param {Function} error Callback function executed when the code activation failed. The error will be passed as only parameter to the error callback.
     * @returns {String|Boolean} Returns true, if the code activation succeeded and no success callback was used. Returns the error, if the code activation failed and no error callback was used.
     */
    activate : function (instance, code_version, token, success, error) {
        activateVersion(instance, code_version, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 &&
                    ( !res.fault || res.body.fault.type == 'CodeVersionModificationException')) {
                    // if successful (or code version already active)
                    if (success) {
                        // callback success
                        success();
                        return;
                    }
                    // or just return true
                    return true;
                }

                // in case of errors
                if (error) {
                    // callback error with passed err
                    error(err);
                    return;
                }
                // or just return err
                return err;
            });
        });
    }
};