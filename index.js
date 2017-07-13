#!/usr/bin/env node
var program = require('commander');

program
    .command('client:auth <client>')
    .description('Authenticate a client')
    .action(function(client) {
        console.log('auth client "%s"', client);
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