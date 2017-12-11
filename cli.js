#!/usr/bin/env node
var program = require('commander');
var dwjson = require('./lib/dwjson').init({process: process});
program
    .command('client:auth [client] [secret]')
    .option('-r, --renew','Controls whether the authentication should be automatically renewed, ' +
        'once the token expires.')
    .description('Authenticate an Commerce Cloud Open Commerce API client')
    .action(function(client, secret, options) {
        var renew = ( options.renew ? options.renew : false );
        require('./lib/auth').auth(client || dwjson['client-id'] , secret || dwjson['client-secret'], renew);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci client:auth aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
        console.log('    $ sfcc-ci client:auth aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -r');
        console.log();
    });

program
    .command('client:auth:renew')
    .description('Renews the client authentication. Requires the initial client authentication to ' +
        'be run with the --renew option.')
    .action(function() {
        require('./lib/auth').renew();
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci client:auth:renew');
        console.log();
    });

program
    .command('client:auth:token')
    .description('Return the current authentication token')
    .action(function() {
        console.log(require('./lib/auth').getToken());
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci client:auth:token');
        console.log();
    });

program
    .command('client:clear')
    .description('Clears the Commerce Cloud Open Commerce API client settings')
    .action(function() {
        require('./lib/auth').clear();
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci client:clear');
        console.log();
    });

program
    .command('instance:add [instance] [alias]')
    .description('Adds a new Commerce Cloud instance to the list of configured instances')
    .action(function(instance, alias) {
        if (!alias) {
            alias = instance.split('.')[0];
        }
        require('./lib/instance').add(instance, alias);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:add my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:add my-instance.demandware.net my-instance');
        console.log();
    });

program
    .command('instance:set <alias>')
    .description('Sets a Commerce Cloud instance as the current default instance')
    .action(function(alias) {
        require('./lib/instance').setDefault(alias);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:set my-instance');
        console.log();
    });

program
    .command('instance:clear')
    .description('Clears all configured Commerce Cloud instances')
    .action(function() {
        require('./lib/instance').clearAll();
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:clear');
        console.log();
    });

program
    .command('instance:list')
    .option('-v, --verbose', 'Outputs additional details of the current configuration')
    .description('List instance and client details currently configured')
    .action(function(options) {
        var verbose = ( options.verbose ? options.verbose : false );
        require('./lib/instance').list(verbose);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:list');
        console.log('    $ sfcc-ci instance:list -v');
        console.log();
    });

program
    .command('instance:upload <archive>')
    .option('-i, --instance [instance]','Instance to upload the import file to. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .description('Uploads an instance import file onto a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance) || dwjson['hostname'];
        var sync = ( options.sync ? options.sync : false );
        require('./lib/webdav').uploadInstanceImport(instance, archive, sync);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:upload archive.zip');
        console.log('    $ sfcc-ci instance:upload archive.zip -i my-instance-alias');
        console.log('    $ sfcc-ci instance:upload archive.zip -i my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:upload archive.zip -i my-instance.demandware.net -s');
        console.log();
    });

program
    .command('instance:import <archive>')
    .option('-i, --instance <instance>','Instance to run the import on. Can be an instance alias. ' +
        'If not specified the currently configured instance will be used.')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .description('Perform a instance import (aka site import) on a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance) || dwjson['hostname'];
        var sync = ( options.sync ? options.sync : false );
        if (sync) {
            require('./lib/instance').importSync(instance, archive);
        } else {
            require('./lib/instance').import(instance, archive);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:import archive.zip');
        console.log('    $ sfcc-ci instance:import archive.zip -i my-instance-alias');
        console.log('    $ sfcc-ci instance:import archive.zip -i my-instance-alias -s');
        console.log('    $ sfcc-ci instance:import archive.zip -i my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:import archive.zip -i my-instance.demandware.net -s');
        console.log('    $ sfcc-ci instance:import archive.zip -s');
        console.log();
    });

program
    .command('instance:state:save')
    .option('-i, --instance <instance>','Instance to save the state for. Can be an instance alias. ' +
        'If not specified the currently configured instance will be used.')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .description('Perform a save of the state of a Commerce Cloud instance')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var sync = ( options.sync ? options.sync : false );
        if (sync) {
            require('./lib/instance').saveStateSync(instance);
        } else {
            require('./lib/instance').saveState(instance);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:state:save');
        console.log('    $ sfcc-ci instance:state:save -i my-instance-alias');
        console.log('    $ sfcc-ci instance:state:save -i my-instance-alias -s');
        console.log('    $ sfcc-ci instance:state:save -i my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:state:save -i my-instance.demandware.net -s');
        console.log('    $ sfcc-ci instance:state:save -s');
        console.log();
    });

program
    .command('instance:state:reset')
    .option('-i, --instance <instance>','Instance to reset its state for. Can be an instance alias. ' +
        'If not specified the currently configured instance will be used.')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .description('Perform a reset of a previously saved state of a Commerce Cloud instance')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var sync = ( options.sync ? options.sync : false );
        if (sync) {
            require('./lib/instance').resetStateSync(instance);
        } else {
            require('./lib/instance').resetState(instance);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:state:reset');
        console.log('    $ sfcc-ci instance:state:reset -i my-instance-alias');
        console.log('    $ sfcc-ci instance:state:reset -i my-instance-alias -s');
        console.log('    $ sfcc-ci instance:state:reset -i my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:state:reset -i my-instance.demandware.net -s');
        console.log('    $ sfcc-ci instance:state:reset -s');
        console.log();
    });

program
    .command('code:list')
    .option('-i, --instance <instance>','Instance to get list of custom code versions from. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .description('List all custom code versions deployed on the Commerce Cloud instance')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/code').list(instance);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:list');
        console.log('    $ sfcc-ci code:list -i my-instance-alias');
        console.log('    $ sfcc-ci code:list -i my-instance.demandware.net');
        console.log();
    });

program
    .command('code:deploy <archive>')
    .option('-i, --instance <instance>','Instance to deploy the custom code archive to. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .description('Deploys a custom code archive onto a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var sync = ( options.sync ? options.sync : false );
        require('./lib/webdav').deployCode(instance, archive, sync);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:deploy code.zip');
        console.log('    $ sfcc-ci code:deploy code.zip -i my-instance-alias');
        console.log('    $ sfcc-ci code:deploy code.zip -i my-instance.demandware.net');
        console.log('    $ sfcc-ci code:deploy code.zip -i my-instance.demandware.net -s');
        console.log();
    });

program
    .command('code:activate <version>')
    .option('-i, --instance <instance>','Instance to activate the custom code version on. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .description('Activate the custom code version on a Commerce Cloud instance')
    .action(function(version, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/code').activate(instance, version);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:activate version1');
        console.log('    $ sfcc-ci code:activate version1 -i my-instance-alias');
        console.log('    $ sfcc-ci code:activate version1 -i my-instance.demandware.net');
        console.log();
    });

program
    .command('job:run <job_id> [job_parameters...]')
    .option('-i, --instance <instance>','Instance to run the job on. Can be an instance alias. If not ' +
        'specified the currently configured instance will be used.')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .description('Starts a job execution on a Commerce Cloud instance')
    .action(function(job_id, job_parameters, options) {
        var job_params = require('./lib/job').buildParameters(job_parameters);
        var instance = require('./lib/instance').getInstance(options.instance);
        var sync = ( options.sync ? options.sync : false );

        if (sync) {
            require('./lib/job').runSync(instance, job_id, {
                parameters : job_params
            });
        } else {
            require('./lib/job').run(instance, job_id, {
                parameters : job_params
            });
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci job:run my-job');
        console.log('    $ sfcc-ci job:run my-job param1=value1 param2=value2');
        console.log('    $ sfcc-ci job:run my-job -i my-instance-alias');
        console.log('    $ sfcc-ci job:run my-job -i my-instance-alias param1=value1 param2=value2');
        console.log('    $ sfcc-ci job:run my-job -i my-instance.demandware.net');
        console.log('    $ sfcc-ci job:run my-job -i my-instance.demandware.net param1=value1 param2=value2');
        console.log('    $ sfcc-ci job:run my-job -s');
        console.log();
    });

program
    .command('job:status <job_id> <job_execution_id>')
    .option('-i, --instance <instance>','Instance the job was executed on. Can be an instance alias. ' +
        'If not specified the currently configured instance will be used.')
    .option('-v, --verbose', 'Outputs additional details of the job execution')
    .option('-l, --logfile', 'Opens the job log file in a browser')
    .description('Get the status of a job execution on a Commerce Cloud instance')
    .action(function(job_id, job_execution_id, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var verbose = ( options.verbose ? options.verbose : false );
        var logfile = ( options.logfile ? options.logfile : false );

        require('./lib/job').status(instance, job_id, job_execution_id, verbose, logfile);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id');
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -v');
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -i my-instance-alias');
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -v -i my-instance-alias');
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -i my-instance.demandware.net');
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -v -i my-instance.demandware.net');
        console.log();
    });

program.on('--help', function() {
    console.log('');
    console.log('  Detailed Help:');
    console.log('');
    console.log('    Use sfcc-ci <sub:command> --help to get detailed help and example usage of sub:commands');
    console.log('');
});

program.parse(process.argv);

if (!program.args.length) {
    program.help();
}