var request = require('superagent');
var open = require('open');

var auth = require('./auth');
var config = require('./config').obtain();
var ocapi = require('./ocapi');

const LOG_FILE_DIR = '/on/demandware.servlet/webdav/Sites/Impex/log/';

function runJob(instance, job_id, request_doc, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/jobs/{job_id}/executions'
    endpoint = endpoint.replace('{job_id}', job_id);

    var doc = ( request_doc ? request_doc : null );

    request
        .post('https://' + instance + endpoint)
        .set('Authorization', 'Bearer ' + token)
        .send(doc)
        .end(callback);
}

function run(instance, job_id, request_doc) {
    // progress
    var spinner = new require('cli-spinner').Spinner('Processing... %s')
    spinner.start();

    runJob(instance, job_id, request_doc, auth.getToken(), function (err, res) {
        spinner.stop(true);
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && ( res.statusCode == 200 || res.statusCode == 202 ) && !res.fault) {
                var job_execution_id = res.body.id;
                console.log('Job "%s" successfully started on "%s".', job_id, instance);
                console.log('Job execution id: %s', job_execution_id);
                console.log('Check the status of this job execution by running:');
                console.log();
                console.log('    sfcc-ci job:status "%s" "%s"', job_id, job_execution_id);
                console.log();
            } else {
                console.error('Error: starting job "%s" on "%s" has failed: %s (%s)',
                    job_id, instance, res.body.fault.type, res.body.fault.message);
            }
        }, function() {
            run(instance, job_id, request_doc);
        });
    });
}

function getStatus(instance, job_id, job_execution_id, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/jobs/{job_id}/executions/{job_execution_id}'
    endpoint = endpoint.replace('{job_id}', job_id).replace('{job_execution_id}', job_execution_id);

    request
        .get('https://' + instance + endpoint)
        .set('Authorization', 'Bearer ' + token)
        .end(callback);
}

function status(instance, job_id, job_execution_id, verbose, logfile) {
    // progress
    var spinner = new require('cli-spinner').Spinner('Processing... %s')
    spinner.start();

    getStatus(instance, job_id, job_execution_id, auth.getToken(), function (err, res) {
        spinner.stop(true);
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200 && !res.fault) {
                var job_execution = res.body;
                console.log('Status of job execution %s (%s): %s (%s)',
                    job_execution_id, job_id, job_execution.execution_status, job_execution.status);
                // handle options for job status output
                if (verbose) {
                    // verbose log output
                    console.log('');
                    console.log('Execution details:');
                    console.log('');
                    for (var prop in job_execution) {
                        console.log('    %s : %s', prop, job_execution[prop]);
                    }
                    console.log('');
                    console.log('Log file:');
                    console.log('');
                    if (job_execution['is_log_file_existing']) {
                        console.log('    https://' + instance + LOG_FILE_DIR + job_execution['log_file_name']);
                    } else {
                        console.log('    No log file available');
                    }
                } else if (logfile) {
                    // open log file in browser
                    var logFileUrl = 'https://' + instance + LOG_FILE_DIR + job_execution['log_file_name'];
                    console.log('');
                    console.log('Opening browser to log file...');
                    open(logFileUrl);
                }
                console.log('');
            } else {
                console.error('Error: Getting job execution "%s" for job "%s" on "%s" failed: %s (%s)',
                    job_execution_id, job_id, instance, res.body.fault.type, res.body.fault.message);
            }
        }, function() {
            status(instance, job_id, job_execution_id, verbose, logfile);
        });
    });
}

function buildParameters(job_params) {
    var params = [];

    if (job_params) {
        job_params.forEach(function (param) {
            var split = param.split('=');
            params.push({name:split[0],value:(split.length > 1 ? split[1] : null)});
        });
    }
    return params;
}

module.exports.run = run;
module.exports.runJob = runJob;
module.exports.buildParameters = buildParameters;
module.exports.status = status;
module.exports.api = {
    /**
     * Starts a job execution on a Commerce Cloud instance. The job is triggered and the result of the attempt to
     * start the job is returned. You may use the API function status to get the current job execution status.
     * 
     * @param {String} instance Instance to start the job on
     * @param {String} job_id The job to start
     * @param {String} token The Oauth token to use for authentication
     * @param {Array} job_params Array containing job parameters. A job parameter must be denoted by an object holding a key and a value property.
     * @param {Function} callback Callback function executed as a result. The job execution details and the error will be passed as parameters to the callback function.
     */
    run : function (instance, job_id, job_params, token, callback) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance missing or not of type String');
        }
        if (typeof(job_id) !== 'string') {
            throw new TypeError('Parameter job_id missing or not of type String');
        }
        if (typeof(job_params) !== 'object') {
            throw new TypeError('Parameter job_params must either be null or not of type Object');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback missing or not of type Function');
        }
        runJob(instance, job_id, { parameters : job_params }, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && ( res.statusCode == 200 || res.statusCode == 202 ) && !res.fault) {
                    // if successful, callback with execution details
                    callback(res.body, undefined);
                    return;
                }
                // in case of errors, callback with err
                error(undefined, new Error(err));
                return;
            });
        });
    },

    /**
     * Get the status of a job execution on a Commerce Cloud instance.
     * 
     * @param {String} instance Instance the job was executed on.
     * @param {String} job_id The job to get the execution status for
     * @param {String} job_execution_id The job execution id to get the status for
     * @param {String} token The Oauth token to use for authentication
     * @param {Function} callback Callback function executed as a result. The job execution details and the error will be passed as parameters to the callback function.
     */
    status : function (instance, job_id, job_execution_id, token, success, error) {
        // check parameters
        if (typeof(instance) !== 'string') {
            throw new TypeError('Parameter instance missing or not of type String');
        }
        if (typeof(job_id) !== 'string') {
            throw new TypeError('Parameter job_id missing or not of type String');
        }
        if (typeof(job_execution_id) !== 'string') {
            throw new TypeError('Parameter job_execution_id missing or not of type String');
        }
        if (typeof(token) !== 'string') {
            throw new TypeError('Parameter token missing or not of type String');
        }
        if (typeof(callback) !== 'function') {
            throw new TypeError('Parameter callback missing or not of type Function');
        }
        getStatus(instance, job_id, job_execution_id, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && res.statusCode == 200 && !res.fault) {
                    // if successful, callback with execution details
                    callback(res.body, undefined);
                    return;
                }

                // in case of errors, callback with err
                callback(undefined, new Error(err));
                return;
            });
        });
    }
};