/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var request = require('request');
var util = require('util');

var opn = require('open');

var auth = require('./auth');
var config = require('./config').obtain();
var console = require('./log');
var ocapi = require('./ocapi');

const LOG_FILE_DIR = '/on/demandware.servlet/webdav/Sites/Impex/log/';
const JOB_EXECUTION_STATUS_POLL_TIMEOUT = 5000;
const JOB_EXECUTION_STATUS_POLL_ERROR_THRESHOLD = 5;
const JOB_EXECUTION_STATUS_CODE_RUNNING = 'RUNNING';
const JOB_EXECUTION_EXIT_STATUS_ERROR = 'error';

// enable request debugging
if ( process.env.DEBUG ) {
    require('request-debug')(request);
}

function runJob(instance, job_id, request_doc, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/jobs/{job_id}/executions'
    endpoint = endpoint.replace('{job_id}', job_id);

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);

    // the post body
    options['body'] = (request_doc ? request_doc : null);

    // just do the request and pass the callback
    request.post(options, callback);
}

function run(instance, job_id, request_doc, asJson) {
    runJob(instance, job_id, request_doc, auth.getToken(), function (err, res) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && ( res.statusCode == 200 || res.statusCode == 202 ) && !res.fault) {
                var job_execution = res.body;
                // handle options for job status output
                if (asJson) {
                    console.json(job_execution);
                    return;
                }
                console.info('Job "%s" started on %s.', job_id, instance);
                console.info('Job execution id: %s', job_execution.id);
                console.info('Check the status of this job execution by running:');
                console.info();
                console.info('    sfcc-ci job:status "%s" "%s" -i %s', job_id, job_execution.id, instance);
                console.info();
                return;
            }
            // in case of errors
            var result = { error : util.format('Starting job "%s" on %s failed',
                job_id, instance), fault : res.body.fault };
            if (asJson) {
                console.json(result);
            } else {
                console.error(result['error']);
                console.debug(result['fault']);
            }
        }, function() {
            run(instance, job_id, request_doc, asJson);
        });
    });
}

function runSync(instance, job_id, request_doc, asJson, failFast) {
    runJob(instance, job_id, request_doc, auth.getToken(), function (err, res) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && ( res.statusCode == 200 || res.statusCode == 202 ) && !res.fault) {
                var job_execution = res.body;

                if (!asJson) {
                    console.info('Job "%s" started on %s. Execution id is: %s',
                        job_id, instance, job_execution.id);
                    console.info('Waiting for job to finish...');
                }

                // no failure
                var running = true;
                var result = {};
                // error threshold
                var errorThreshold = JOB_EXECUTION_STATUS_POLL_ERROR_THRESHOLD;

                var timeout = setInterval(function() {
                    getStatus(instance, job_id, job_execution.id, auth.getToken(), function (err, res) {
                        ocapi.ensureValidToken(err, res, function(err, res) {
                            if (!err && res.statusCode == 200 && !res.fault) {
                                // update the execution details
                                job_execution = res.body;
                                if (job_execution.status !== JOB_EXECUTION_STATUS_CODE_RUNNING ) {
                                    running = false;
                                }
                                return;
                            } else if ( err && res.statusCode > 200 && errorThreshold > 0) {
                                // decrease the error threshold
                                errorThreshold--;
                                // don't set an error and allow the polling to continue
                                console.debug('Polling job status failed. Polling error threshold not reached.');
                            } else if ( err && res.statusCode > 200 && errorThreshold === 0) {
                                // report a reached error threshold during polling
                                result['error'] = util.format('Polling job status "%s" on %s failed. Error ' +
                                    'threshold reached. Stop polling, the job may still run.', job_id, instance);
                            } else {
                                // in case of errors, mark failure
                                result['fault'] = res.body.fault;
                                result['error'] = util.format('Running job "%s" on %s failed', job_id, instance);
                            }
                        });
                    });

                    if (!running || result['error']) {
                        clearInterval(timeout);
                        if (result['error']) {
                            if (asJson) {
                                console.json(result);
                                return;
                            }
                            console.error(result['error']);
                            console.debug(result['fault']);
                        } else {
                            if (asJson) {
                                console.json(job_execution);
                                return;
                            }
                            console.info('Job "%s" finished. Status is: %s (%s)',
                                job_id, job_execution.execution_status, job_execution.status);
                            console.info('');
                            console.info('Execution details:');
                            console.info('');
                            console.prettyPrint(job_execution);
                            console.info('');
                            console.info('Log file:');
                            console.info('');
                            if (job_execution['is_log_file_existing']) {
                                console.info('  https://' + instance + LOG_FILE_DIR + job_execution['log_file_name']);
                            } else {
                                console.info('  No log file available');
                            }
                            // report a failing job gracefully with fail-fast
                            if (failFast && job_execution.exit_status.status === JOB_EXECUTION_EXIT_STATUS_ERROR ) {
                                console.error("Job ended with error. You may check the log files for further details.");
                            }
                        }
                    }
                }, JOB_EXECUTION_STATUS_POLL_TIMEOUT);
                return;
            }
            // in case of errors
            var result = { error : util.format('Starting job "%s" on %s failed',
                job_id, instance), fault : res.body.fault };
            if (asJson) {
                console.json(result);
            } else {
                console.error(result['error']);
                console.debug(result['fault']);
            }
        }, function() {
            runSync(instance, job_id, request_doc, asJson, failFast);
        });
    });
}

function getStatus(instance, job_id, job_execution_id, token, callback) {
    var endpoint = '/s/-/dw/data/' + ocapi.getOcapiVersion() + '/jobs/{job_id}/executions/{job_execution_id}'
    endpoint = endpoint.replace('{job_id}', job_id).replace('{job_execution_id}', job_execution_id);

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);

    // just do the request and pass the callback
    request.get(options, callback);
}

function status(instance, job_id, job_execution_id, verbose, streamLog, openLogFile, asJson) {
    getStatus(instance, job_id, job_execution_id, auth.getToken(), function (err, res) {
        ocapi.ensureValidToken(err, res, function(err, res) {
            if (!err && res.statusCode == 200 && !res.fault) {
                var job_execution = res.body;
                // handle options for job status output
                if (asJson) {
                    console.json(job_execution);
                    return;
                } else if (streamLog) {
                    console.info('Stream log...');
                    // ensure log is available
                    if (job_execution['is_log_file_existing']) {
                        // make request to log file
                        var logUrl = 'https://' + instance + LOG_FILE_DIR + job_execution['log_file_name'];
                        requestLogFile(instance, job_execution['log_file_name'], auth.getToken()).pipe(process.stdout);
                    } else {
                        console.info('No log available');
                    }
                    return;
                }
                console.info('Status of job execution %s (%s): %s (%s)',
                    job_execution_id, job_id, job_execution.execution_status, job_execution.status);
                if (verbose) {
                    // verbose log output
                    console.info('');
                    console.info('Execution details:');
                    console.info('');
                    console.prettyPrint(job_execution);
                    console.info('');
                    console.info('Log file:');
                    console.info('');
                    if (job_execution['is_log_file_existing']) {
                        console.info('  https://' + instance + LOG_FILE_DIR + job_execution['log_file_name']);
                    } else {
                        console.info('  No log file available');
                    }
                } else if (openLogFile) {
                    // open log file in browser
                    var logFileUrl = 'https://' + instance + LOG_FILE_DIR + job_execution['log_file_name'];
                    console.info('');
                    console.info('Opening browser to log file...');
                    opn(logFileUrl);
                }
                console.info('');
                return;
            }
            // in case of errors
            var result = { error : util.format('Getting job execution "%s" for job "%s" on %s failed',
                job_execution_id, job_id, instance), fault : res.body.fault };
            if (asJson) {
                console.json(result);
            } else {
                console.error(result['error']);
                console.debug(result['fault']);
            }
        }, function() {
            status(instance, job_id, job_execution_id, verbose, streamLog, openLogFile, asJson);
        });
    });
}

function buildParameters(job_params) {
    var params = [];

    if (job_params) {
        job_params.forEach(function (param) {
            var split = param.split('=');
            params.push({
                name: split[0],
                value: (split.length > 1 ? split[1] : null)
            });
        });
    }
    return params;
}

function requestLogFile(instance, logfile, token) {
    var endpoint = LOG_FILE_DIR + logfile

    // build the request options
    var options = ocapi.getOptions(instance, endpoint, token);
    console.debug(options);
    // just do the request and return
    return request.get(options);
}

module.exports.run = run;
module.exports.runSync = runSync;
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
     * @param {Function} callback Callback function executed as a result. The error and the job execution details will be passed as parameters to the callback function.
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
        runJob(instance, job_id, job_params, token, function (err, res) {
            ocapi.ensureValidToken(err, res, function(err, res) {
                if (!err && ( res.statusCode == 200 || res.statusCode == 202 ) && !res.fault) {
                    // if successful, callback with execution details
                    callback(err, res);
                    return;
                }
                // in case of errors, callback with err
                callback(err, res);
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
     * @param {Function} callback Callback function executed as a result. The error and the job execution details will be passed as parameters to the callback function.
     */
    status : function (instance, job_id, job_execution_id, token, callback) {
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
                    // Success: Callback with execution details
                    callback(undefined, res.body);
                    return;
                }

                // Handle Errors
                if (res.text) {
                    callback(err, JSON.parse(res.text));
                } else {
                    callback(err, undefined);
                }

                return;
            });
        });
    }
};