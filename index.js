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
    .command('instance:set <instance>')
    .description('Sets a Commerce Cloud instance')
    .action(function(instance) {
        console.log('set instance "%s"', instance);
    });

program
    .command('instance:save <instance>')
    .description('Perform a save snapshot on a Commerce Cloud instance')
    .action(function(instance) {
        console.log('save instance snapshot on "%s"', instance);
    });

program
    .command('instance:reset <instance>')
    .description('Perform a reset of a Commerce Cloud instance')
    .action(function(instance) {
        console.log('reset instance "%s"', instance);
    });

program
    .command('import:upload <instance> <import_file>')
    .description('Upload a site import file to a Commerce Cloud instance')
    .action(function(instance, import_file) {
        console.log('upload site import file "%s" to instance "%s"', import_file, instance);
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