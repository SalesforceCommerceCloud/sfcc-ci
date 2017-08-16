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
    .command('instance:config <instance> [alias]')
    .description('Adds a new Commerce Cloud instance to the list of configured instances')
    .action(function(instance, alias) {
        require('./lib/instance').config(instance, ( alias ? alias : instance ));
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:config my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:config my-instance.demandware.net my-instance');
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
    .option('-v --verbose', 'Outputs additional details of the current configuration')
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
    });

program
    .command('import:site <instance> <import_file>')
    .description('Perform a site import on Commerce Cloud instance')
    .action(function(instance, import_file) {
        console.log('perform site import of "%s" on instance "%s"', import_file, instance);
    });

program
    .command('code:upload <instance> <repository>')
    .description('Upload the custom code repository to a Commerce Cloud instance')
    .action(function(instance, repository) {
        console.log('upload custom code "%s" onto instance "%s"', repository, instance);
    });

program
    .command('code:activate <instance> <version>')
    .description('Activate the custom code version on a Commerce Cloud instance')
    .action(function(instance, version) {
        console.log('activate code "%s" on instance "%s"', version, instance);
    });

program
    .command('job:execute <instance> <job>')
    .description('Execute a job on a Commerce Cloud instance')
    .action(function(instance, job) {
        console.log('execute job "%s" on instance "%s"', job, instance);
    });

program.parse(process.argv);