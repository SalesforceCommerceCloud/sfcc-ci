#!/usr/bin/env node
var program = require('commander');

program
    .command('client:auth <client> <secret>')
    .option('-r, --renew','Controls whether the authentication should be automatically renewed, once the token expires.')
    .description('Authenticate an Commerce Cloud Open Commerce API client')
    .action(function(client, secret, options) {
        var renew = ( options.renew ? options.renew : false );
        require('./lib/auth').auth(client, secret, renew);
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
    .description('Renews the client authentication. Requires the initial client authentication to be run with the --renew option.')
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
    .command('instance:add <instance> [alias]')
    .description('Adds a new Commerce Cloud instance to the list of configured instances')
    .action(function(instance, alias) {
        require('./lib/instance').add(instance, ( alias ? alias : instance ));
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
    .command('instance:state:save')
    .option('-i, --instance <instance>','Instance to save the state for. Can be an instance alias. If not specified the currently configured instance will be used.')
    .description('Perform a save of the state of a Commerce Cloud instance')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/instance').saveState(instance);
    });

program
    .command('instance:state:reset')
    .option('-i, --instance <instance>','Instance to reset its state for. Can be an instance alias. If not specified the currently configured instance will be used.')
    .description('Perform a reset of a previously saved state of a Commerce Cloud instance')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/instance').resetState(instance);
    });

program
    .command('code:activate <version>')
    .option('-i, --instance <instance>','Instance to activate the custom code version on. Can be an instance alias. If not specified the currently configured instance will be used.')
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
    .command('import:site <import_file>')
    .option('-i, --instance <instance>','Instance to run the site import on. Can be an instance alias. If not specified the currently configured instance will be used.')
    .description('Perform a site import on a Commerce Cloud instance')
    .action(function(import_file, options) {
        var instance = require('./lib/instance').getInstance(options.instance);

        require('./lib/import').site(instance, import_file);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci import:site my-site-import.zip');
        console.log('    $ sfcc-ci import:site my-site-import.zip -i my-instance-alias');
        console.log('    $ sfcc-ci import:site my-site-import.zip -i my-instance.demandware.net');
        console.log();
    });

program
    .command('job:run <job_id> [job_parameters...]')
    .option('-i, --instance <instance>','Instance to run the job on. Can be an instance alias. If not specified the currently configured instance will be used.')
    .description('Starts a job execution on a Commerce Cloud instance')
    .action(function(job_id, job_parameters, options) {
        var job_params = require('./lib/job').buildParameters(job_parameters);
        var instance = require('./lib/instance').getInstance(options.instance);

        require('./lib/job').run(instance, job_id, { 
            parameters : job_params 
        });
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
        console.log();
    });

program
    .command('job:status <job_id> <job_execution_id>')
    .option('-i, --instance <instance>','Instance the job was executed on. Can be an instance alias. If not specified the currently configured instance will be used.')
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

if(!program.args.length) {
    program.help();
} else {
    console.error('Error: Unknown command "%s". Use "sfcc-ci --help".', program.args[0]);
}