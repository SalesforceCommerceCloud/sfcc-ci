var request = require('superagent');

var auth = require('./auth');
var ocapi = require('./ocapi');
var progress = require('./progress');

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
    progress.start();

    activateVersion(instance, code_version, auth.getToken(), function (err, res) {
        progress.stop();
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
                if (!err && res.statusCode == 200 &&
                    ( !res.fault || res.body.fault.type == 'CodeVersionModificationException')) {
                    // if successful (or code version already active), callback with code version details
                    callback(undefined);
                    return;
                }

                // in case of errors, callback with err
                callback(new Error(err));
                return;
            });
        });
    }
};