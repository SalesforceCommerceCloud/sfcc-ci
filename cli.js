#!/usr/bin/env node
var program = require('commander');

program
    .command('auth:login <client> [secret]')
    .description('Authenticate a present user for interactive use')
    .action(function(client, secret) {
        require('./lib/auth').login(client, secret);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Authenticate a user (resource owner) for interactive use. The user must be present and must');
        console.log('  provide his login credentials as part of the authorization flow. The authorization requires');
        console.log('  an API key (client).');
        console.log();
        console.log('  The client [secret] is optional. If the secret is not provided, the authentication is done');
        console.log('  using the Oauth2 authorization code grant. If the secret is provided, the authentication is');
        console.log('  done using the Oauth2 implicit grant.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci auth:login app-client-id');
        console.log('    $ sfcc-ci auth:login app-client-id app-client-secret');
        console.log();
    });

program
    .command('client:auth [client] [secret] [user] [user_password]')
    .option('-r, --renew','Controls whether the authentication should be automatically renewed, ' +
        'once the token expires.')
    .description('Authenticate an API client with an optional user for automation use')
    .action(function(client, secret, user, user_password, options) {
        var renew = ( options.renew ? options.renew : false );
        require('./lib/auth').auth(client, secret, user, user_password, renew);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Authenticate an API client for automation use, where presense of the resource owner is not');
        console.log('  required. Optionally, user (resource owner) credentials can be provided to grant access to');
        console.log('  user specific resources.');
        console.log();
        console.log('  The user and the user password are optional. If not provided, the authentication is done');
        console.log('  using the Oauth2 client credentials grant. If user and user password are provided, the');
        console.log('  authentication is done using the Oauth2 resource owner password credentials grant.');
        console.log();
        console.log('  The client and the client secret are optional. If not provided, client and secret are read');
        console.log('  from a dw.json file located in the current working directory. When reading credentials from');
        console.log('  a dw.json file, the Oauth2 client credentials grant is used and user credentials are ignored.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci client:auth my_client_id my_client_secret user_name user_password');
        console.log('    $ sfcc-ci client:auth my_client_id my_client_secret');
        console.log('    $ sfcc-ci client:auth my_client_id my_client_secret -r');
        console.log('    $ sfcc-ci client:auth');
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
    .command('sandbox:list')
    .description('List all sandboxes currently created')
    .option('-j, --json','Formats the output in json')
    .action(function(options) {
        var asJson = ( options.json ? options.json : false );
        require('./lib/ccdx').cli.list(asJson);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:list');
        console.log('    $ sfcc-ci sandbox:list --json');
        console.log();
    });

program
    .command('sandbox:create <realm> [alias]')
    .option('-j, --json','Formats the output in json')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .option('-d, --default', 'Sets the created sandbox as default instance.')
    .description('Triggers the creation of a new sandbox')
    .action(function(realm, alias, options) {
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        var setAsDefault = ( options.default ? options.default : false );
        require('./lib/ccdx').cli.create(realm, alias, asJson, sync, setAsDefault);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox will be created for the realm using the <realm> argument. You must have');
        console.log('  permission to create a new sandbox for the realm. The number of sandboxes allowed to create');
        console.log('  is limited. The command only trigger the creation and does not wait until the sandbox is');
        console.log('  fully up and running. Use may use `sfcc-ci sandbox:list` to check the status of the creation.');
        console.log();
        console.log('  You can force the command to wait until the creation of the sandbox has been finished and the');
        console.log('  is available to use (in "started" status) by using the --sync flag.');
        console.log();
        console.log('  The created sandbox is being added to the list of instances with its host name. The optional');
        console.log('  [alias] is used as alias for the new instance. If [alias] is omitted, the host is used as');
        console.log('  alias.');
        console.log();
        console.log('  If executed with --default flag, the created sandbox will be set as new default instance.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:create my-realm');
        console.log('    $ sfcc-ci sandbox:create my-realm an-alias');
        console.log('    $ sfcc-ci sandbox:create my-realm an-alias -d');
        console.log('    $ sfcc-ci sandbox:create my-realm -s');
        console.log('    $ sfcc-ci sandbox:create my-realm an-alias -s');
        console.log('    $ sfcc-ci sandbox:create my-realm an-alias -s -d');
        console.log('    $ sfcc-ci sandbox:create my-realm -s -j');
        console.log();
    });

program
    .command('sandbox:get <sandbox_id>')
    .description('Retrieves details of a sandbox')
    .option('-j, --json','Formats the output in json')
    .option('-h, --host','Return the host name of the sandbox')
    .option('-o, --open','Opens a browser with the Business Manager on the sandbox')
    .action(function(sandbox_id, options) {
        var asJson = ( options.json ? options.json : false );
        var hostOnly = ( options.host ? options.host : false );
        var openBrowser = ( options.open ? options.open : false );
        require('./lib/ccdx').cli.get(sandbox_id, asJson, hostOnly, openBrowser);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:get my-sandbox-id');
        console.log('    $ sfcc-ci sandbox:get my-sandbox-id -h');
        console.log();
    });

program
    .command('sandbox:remove <sandbox_id>')
    //.option('-a, --alias <value>', 'Alias of the sandbox to remove.')
    //.option('-h, --host <value>', 'Host of the sandbox to remove.')
    //.option('-r, --realm <value>', 'Realm of the sandbox to remove.')
    //.option('-i, --instance <value>', 'Instance of the sandbox to remove.')
    .description('Triggers the removal of an existing sandbox')
    .action(function(sandbox_id, options) {
        require('./lib/ccdx').cli.remove({ id : sandbox_id });
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox to remove must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes. You must have permission to remove a sandbox. The command');
        console.log('  only triggers the deletion and does not wait until the sandbox is fully removed. Use may use');
        console.log('  `sfcc-ci sandbox:list` to check the status of the removal.');
        //console.log('  Alternatively you may use other ways to identify the sandbox to remove, such as the alias,');
        //console.log('  the host or the realm along with the instance.');
        //console.log();
        //console.log('  If a sandbox_id was passed, arguments alias, host, realm and instance will be ignored. If');
        //console.log('  alias pass passed, the sandbox is being looked up in the list of instances configured.');
        //console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:remove my-sandbox-id');
        //console.log('    $ sfcc-ci sandbox:remove -a my-alias');
        //console.log('    $ sfcc-ci sandbox:remove -h sandbox-host');
        //console.log('    $ sfcc-ci sandbox:remove -r my-realm -i s01');
        console.log();
    });

program
    .command('instance:add <instance> [alias]')
    .option('-d, --default', 'Set the new instance as default')
    .description('Adds a new Commerce Cloud instance to the list of configured instances')
    .action(function(instance, alias, options) {
        var asDefault = ( options.default ? options.default : false );
        require('./lib/instance').add(instance, alias, asDefault);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:add my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:add my-instance.demandware.net -d');
        console.log('    $ sfcc-ci instance:add my-instance.demandware.net my-instance');
        console.log('    $ sfcc-ci instance:add my-instance.demandware.net my-instance -d');
        console.log();
    });

program
    .command('instance:set <alias>')
    .description('Sets a Commerce Cloud instance as the default instance')
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
    .option('-j, --json', 'Formats the output in json')
    .option('-v, --verbose', 'Outputs additional details of the current configuration')
    .description('List instance and client details currently configured')
    .action(function(options) {
        var verbose = ( options.verbose ? options.verbose : false );
        var asJson = ( options.json ? options.json : false );
        require('./lib/instance').list(verbose, asJson);
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
        var instance = require('./lib/instance').getInstance(options.instance);
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
        var instance = require('./lib/instance').getInstance(options.instance);
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
        console.log('');
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