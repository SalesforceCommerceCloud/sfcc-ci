#!/usr/bin/env node
var program = require('commander');
var { prompt } = require('inquirer');

program
    .version(require('./package.json').version, '-V, --version')
    .option('-D, --debug', 'enable verbose output', function() {
        process.env.DEBUG = true;
        process.env.NODE_DEBUG = 'request';
    })
    .option('--selfsigned', 'allow connection to hosts using self-signed certificates', function() {
        process.env.SFCC_ALLOW_SELF_SIGNED = true;
    })
    .option('-I, --ignorewarnings', 'ignore any warnings logged to the console', function() {
        process.env.SFCC_IGNORE_WARNINGS = true;
    });

program
    .command('archive [target] [source]')
    .description('Archives the cartridges for upload on webdav')
    .action(function(target, source) {
        require('./lib/archive').archive(target, source);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Archives the cartridges in preparation for upload with the webdav api');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci archive target.zip source');
    });

program
    .command('auth:login [client] [secret]')
    .option('-a, --authserver [authserver]','The authorization server used to authenticate')
    .description('Authenticate a present user for interactive use')
    .action(function(client, secret, options) {
        require('./lib/auth').login(client, secret, options.authserver);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Authenticate a user (resource owner) for interactive use. The user must be present and must');
        console.log('  provide his login credentials as part of the authentication flow. The authentication requires');
        console.log('  an API key (client).');
        if ( require('./lib/auth').OAUTH_AUTHORIZATION_CODE_GRANT_ALLOWED ) {
            console.log();
            console.log('  The client [secret] is optional. If the secret is not provided, the authentication is done');
            console.log('  using the Oauth2 authorization code grant. If the secret is not provided, the ');
            console.log('  authentication is done using the Oauth2 implicit grant.');
        }
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci auth:login app-client-id');
        if ( require('./lib/auth').OAUTH_AUTHORIZATION_CODE_GRANT_ALLOWED ) {
            console.log('    $ sfcc-ci auth:login app-client-id app-client-secret');
        }
        console.log('    $ sfcc-ci auth:login app-client-id -a account.demandware.com');
        console.log();
    });

program
    .command('auth:logout')
    .description('End the current sessions and clears the authentication')
    .action(function() {
        require('./lib/auth').cli.logout();
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci auth:logout');
        console.log();
    });

program
    .command('client:auth [client] [secret] [user] [user_password]')
    .option('-a, --authserver [authserver]','The authorization server used to authenticate')
    .option('-r, --renew','Controls whether the authentication should be automatically renewed, ' +
        'once the token expires.')
    .description('Authenticate an API client with an optional user for automation use')
    .action(function(client, secret, user, user_password, options) {
        var renew = ( options.renew ? options.renew : false );
        require('./lib/auth').auth(client, secret, user, user_password, renew, options.authserver);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Authenticate an API client for automation use, where presence of the resource owner is not');
        console.log('  required. Optionally, user (resource owner) credentials can be provided to grant access to');
        console.log('  user specific resources.');
        console.log();
        console.log('  The client and the client secret are optional. If not provided, client and secret are read');
        console.log('  from a dw.json file located in the current working directory. When reading credentials from');
        console.log('  a dw.json file, the user credentials are ignored.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci client:auth my_client_id my_client_secret user_name user_password');
        console.log('    $ sfcc-ci client:auth my_client_id my_client_secret');
        console.log('    $ sfcc-ci client:auth my_client_id my_client_secret -r');
        console.log('    $ sfcc-ci client:auth my_client_id my_client_secret -a account.demandware.com');
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
    .command('sandbox:realm:list')
    .description('List realms eligible to manage sandboxes for')
    .option('-r, --realm <realm>','Realm to get details for')
    .option('-j, --json','Formats the output in json')
    .action(function(options) {
        var realm = ( options.realm ? options.realm : null );
        var asJson = ( options.json ? options.json : false );
        require('./lib/sandbox').cli.realm.list(realm, asJson);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Use --realm to get details of a single realm such as configuration and usage');
        console.log('  information about sandboxes.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:realms');
        console.log('    $ sfcc-ci sandbox:realms --json');
        console.log('    $ sfcc-ci sandbox:realms --realm zzzz');
        console.log('    $ sfcc-ci sandbox:realms --realm zzzz --json');
        console.log();
    });

program
    .command('sandbox:realm:update')
    .description('Update realm settings')
    .option('-r, --realm <realm>','Realm to update')
    .option('-m, --max-sandbox-ttl <maxSandboxTTL>','Maximum number of hours a sandbox can live in the realm')
    .option('-d, --default-sandbox-ttl <defaultSandboxTTL>','Number of hours a sandbox lives in the realm by default')
    .option('-j, --json','Formats the output in json')
    .action(function(options) {
        var realm = ( options.realm ? options.realm : null );
        if (!realm) {
            this.missingArgument('realm');
            return;
        }
        var maxSandboxTTL = ( options.maxSandboxTtl ? parseInt(options.maxSandboxTtl) : false );
        var defaultSandboxTTL = ( options.defaultSandboxTtl ? parseInt(options.defaultSandboxTtl) : false );
        var asJson = ( options.json ? options.json : false );
        require('./lib/sandbox').cli.realm.update(realm, maxSandboxTTL, defaultSandboxTTL, asJson);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Update details of a realm.');
        console.log();
        console.log('  Use --max-sandbox-ttl to update the maximum number of hours a sandbox can live');
        console.log('  in the realm (must adhere to the maximum TTL quota). Use --default-sandbox-ttl to');
        console.log('  update the number of hours a sandbox lives in the realm when no TTL was given upon');
        console.log('  provisioning (must adhere to the maximum TTL quota).');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:realm:update --realm zzzz --max-sandbox-ttl 72');
        console.log('    $ sfcc-ci sandbox:realm:update --realm zzzz --default-sandbox-ttl 24');
        console.log();
    });

program
    .command('sandbox:list')
    .description('List all available sandboxes')
    .option('-j, --json','Formats the output in json')
    .option('-S, --sortby <sortby>', 'Sort by specifying any field')
    .action(function(options) {
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortby ? options.sortby : null );
        require('./lib/sandbox').cli.list(asJson, sortby);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:list');
        console.log('    $ sfcc-ci sandbox:list --json');
        console.log();
    });

program
    .command('sandbox:create')
    .option('-r, --realm <realm>','Realm to create the sandbox for')
    .option('-t, --ttl <hours>','Number of hours the sandbox will live')
    .option('-j, --json','Formats the output in json')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .option('-d, --default', 'Sets the created sandbox as default instance.')
    .option('-a, --set-alias <alias>','Instance alias to create for the sandbox')
    .description('Create a new sandbox')
    .action(function(options) {
        var realm = ( options.realm ? options.realm : null );
        var ttl = ( options.ttl ? parseInt(options.ttl) : null );
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        var setAsDefault = ( options.default ? options.default : false );
        var alias = ( options.setAlias ? options.setAlias : null );
        require('./lib/sandbox').cli.create(realm, alias, ttl, asJson, sync, setAsDefault);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox will be created for the realm using the <realm> argument or stored in dw.json');
        console.log('  config file. You must have permission to create a new sandbox for the realm. The number of');
        console.log('  sandboxes allowed to create is limited. The command only trigger the creation and does not');
        console.log('  wait until the sandbox is fully up and running. Use may use `sfcc-ci sandbox:list` to check');
        console.log('  the status of the sandbox.');
        console.log();
        console.log('  You can force the command to wait until the creation of the sandbox has been finished and the');
        console.log('  is available to use (in "started" status) by using the --sync flag.');
        console.log();
        console.log('  The created sandbox is being added to the list of instances with its host name. The optional');
        console.log('  --set-alias <alias> is used as alias for the new instance. If it is omitted, the host is used');
        console.log('  as alias.');
        console.log();
        console.log('  If executed with --default flag, the created sandbox will be set as new default instance.');
        console.log();
        console.log('  The TTL (time to live) in hours of the sandbox can be modified via the --ttl flag. The value');
        console.log('  must adhere to the maximum TTL quotas) If absent the realms default sandbox TTL is used.');
        console.log('  If the sandbox age reaches its TTL, it will be deleted automatically.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:create');
        console.log('    $ sfcc-ci sandbox:create --realm my-realm');
        console.log('    $ sfcc-ci sandbox:create -r my-realm --set-alias an-alias');
        console.log('    $ sfcc-ci sandbox:create -r my-realm -a an-alias -d');
        console.log('    $ sfcc-ci sandbox:create -r my-realm -s');
        console.log('    $ sfcc-ci sandbox:create -r my-realm -a an-alias -s');
        console.log('    $ sfcc-ci sandbox:create -r my-realm -a an-alias -s -d');
        console.log('    $ sfcc-ci sandbox:create -r my-realm -s -j');
        console.log('    $ sfcc-ci sandbox:create -r my-realm --ttl 6');
        console.log();
    });

program
    .command('sandbox:get')
    .description('Get detailed information about a sandbox')
    .option('-s, --sandbox <id>','sandbox to get details for')
    .option('-j, --json','Formats the output in json')
    .option('-h, --host','Return the host name of the sandbox')
    .option('-O, --open','Opens a browser with the Business Manager on the sandbox')
    .option('--show-operations','Display operations performed')
    .option('--show-usage','Display detailed usage information')
    .option('--show-settings','Display settings applied')
    .action(function(options) {
        var sandbox_id = ( options.sandbox ? options.sandbox : null );
        if (!sandbox_id) {
            this.missingArgument('sandbox');
            return;
        }
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        var asJson = ( options.json ? options.json : false );
        var hostOnly = ( options.host ? options.host : false );
        var openBrowser = ( options.open ? options.open : false );
        var showOperations = ( options.showOperations ? options.showOperations : false );
        var showUsage = ( options.showUsage ? options.showUsage : false );
        var showSettings = ( options.showSettings ? options.showSettings : false );
        require('./lib/sandbox').cli.get(spec, asJson, hostOnly, openBrowser, showOperations, showUsage, showSettings);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox to lookup must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log();
        console.log('  Use --show-usage to display detailed usage information, --show-operations to get a list of');
        console.log('  previous operations executed on the sandbox, --show-settings to return the settings initially');
        console.log('  applied to the sandbox during creation.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:get --sandbox my-sandbox-id');
        console.log('    $ sfcc-ci sandbox:get -s my-sandbox-id -j');
        console.log('    $ sfcc-ci sandbox:get -s my-sandbox-id -h');
        console.log('    $ sfcc-ci sandbox:get -s my-sandbox-id -O');
        console.log('    $ sfcc-ci sandbox:get -s my-sandbox-id --show-usage');
        console.log('    $ sfcc-ci sandbox:get -s my-sandbox-id --show-operations');
        console.log('    $ sfcc-ci sandbox:get -s my-sandbox-id --show-settings');
        console.log();
    });

program
    .command('sandbox:update')
    .option('-s, --sandbox <id>','sandbox to update')
    .option('-t, --ttl <hours>','number of hours to add to the sandbox lifetime')
    .description('Update a sandbox')
    .action(function(options) {
        var sandbox_id = ( options.sandbox ? options.sandbox : null );
        if (!sandbox_id) {
            this.missingArgument('sandbox');
            return;
        }
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        var ttl = ( options.ttl ? parseInt(options.ttl) : null );
        require('./lib/sandbox').cli.update(spec, ttl, false);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The TTL (time to live) in hours of the sandbox can be prolonged via the --ttl flag. The value');
        console.log('  must, together with previous prolongiations, adhere to the maximum TTL quotas). If set to 0 or');
        console.log('  less the sandbox will have an infinite lifetime.');
        console.log();
        console.log('  The sandbox to update must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:update --sandbox my-sandbox-id --ttl 8');
        console.log();
    });

program
    .command('sandbox:start')
    .option('-s, --sandbox <id>','sandbox to start')
    .description('Start a sandbox')
    .action(function(options) {
        var sandbox_id = ( options.sandbox ? options.sandbox : null );
        if (!sandbox_id) {
            this.missingArgument('sandbox');
            return;
        }
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        require('./lib/sandbox').cli.start(spec, false);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox to start must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:start --sandbox my-sandbox-id');
        console.log();
    });

program
    .command('sandbox:stop')
    .option('-s, --sandbox <id>','sandbox to stop')
    .description('Stop a sandbox')
    .action(function(options) {
        var sandbox_id = ( options.sandbox ? options.sandbox : null );
        if (!sandbox_id) {
            this.missingArgument('sandbox');
            return;
        }
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        require('./lib/sandbox').cli.stop(spec, false);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox to stop must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:stop --sandbox my-sandbox-id');
        console.log();
    });

program
    .command('sandbox:restart')
    .option('-s, --sandbox <id>','sandbox to restart')
    .description('Restart a sandbox')
    .action(function(options) {
        var sandbox_id = ( options.sandbox ? options.sandbox : null );
        if (!sandbox_id) {
            this.missingArgument('sandbox');
            return;
        }
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        require('./lib/sandbox').cli.restart(spec, false);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox to restart must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:restart --sandbox my-sandbox-id');
        console.log();
    });

program
    .command('sandbox:reset')
    .option('-s, --sandbox <id>','sandbox to reset')
    .option('-N, --noprompt','No prompt to confirm reset')
    .description('Reset a sandbox')
    .action(function(options) {
        var sandbox_id = ( options.sandbox ? options.sandbox : null );
        if (!sandbox_id) {
            this.missingArgument('sandbox');
            return;
        }
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        var noPrompt = ( options.noprompt ? options.noprompt : false );
        if ( noPrompt ) {
            require('./lib/sandbox').cli.reset(spec, false);
        } else {
            prompt({
                type : 'confirm',
                name : 'ok',
                default : false,
                message : 'Reset sandbox ' + sandbox_id + '. Are you sure?'
            }).then((answers) => {
                if (answers['ok']) {
                    require('./lib/sandbox').cli.reset(spec, false);
                }
            });
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  WARNING: This is a destructive operation and you will loose any data stored on the sandbox.');
        console.log();
        console.log('  The sandbox to reset must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:reset --sandbox my-sandbox-id');
        console.log('    $ sfcc-ci sandbox:reset --sandbox my-sandbox-id --noprompt');
        console.log();
    });

program
    .command('sandbox:delete')
    .option('-s, --sandbox <id>','sandbox to delete')
    .option('-N, --noprompt','No prompt to confirm delete')
    .description('Delete a sandbox')
    .action(function(options) {
        var sandbox_id = ( options.sandbox ? options.sandbox : null );
        if (!sandbox_id) {
            this.missingArgument('sandbox');
            return;
        }
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        var noPrompt = ( options.noprompt ? options.noprompt : false );
        if ( noPrompt ) {
            require('./lib/sandbox').cli.delete(spec);
        } else {
            prompt({
                type : 'confirm',
                name : 'ok',
                default : false,
                message : 'Delete sandbox ' + sandbox_id + '. Are you sure?'
            }).then((answers) => {
                if (answers['ok']) {
                    require('./lib/sandbox').cli.delete(spec);
                }
            });
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  WARNING: This is a destructive operation and you will loose any data stored on the sandbox.');
        console.log();
        console.log('  The sandbox to delete must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes. You must have permission to delete a sandbox. The command');
        console.log('  only triggers the deletion and does not wait until the sandbox is fully deleted. Use may use');
        console.log('  `sfcc-ci sandbox:list` to check the status of the deletion.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:delete --sandbox my-sandbox-id');
        console.log('    $ sfcc-ci sandbox:delete --sandbox my-sandbox-id --noprompt');
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
    .command('instance:set <alias_or_host>')
    .description('Sets a Commerce Cloud instance as the default instance')
    .action(function(alias_or_host) {
        require('./lib/instance').config.setDefault(alias_or_host);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:set my-instance');
        console.log('    $ sfcc-ci instance:set my-instance.demandware.net');
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
    .option('-S, --sortby <sortby>', 'Sort by specifying any field')
    .description('List instance and client details currently configured')
    .action(function(options) {
        var verbose = ( options.verbose ? options.verbose : false );
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortby ? options.sortby : null );
        require('./lib/instance').list(verbose, asJson, sortby);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:list');
        console.log('    $ sfcc-ci instance:list -v');
        console.log('    $ sfcc-ci instance:list -j');
        console.log('    $ sfcc-ci instance:list --sortby=alias');
        console.log();
    });

program
    .command('instance:upload <archive>')
    .option('-i, --instance [instance]','Instance to upload the import file to. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-c, --certificate [certificate]','Path to the certificate to use for two factor authentication.')
    .option('-p, --passphrase [passphrase]','Passphrase to be used to read the given certificate.')
    .description('Uploads an instance import file onto a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/webdav').uploadInstanceImport(instance, archive, {
            pfx: options.certificate,
            passphrase: options.passphrase
        });
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Uploads the passed site import archive file onto an instance. The archive must be a zip file');
        console.log('  If the archive file does not have the file extension *.zip it will be appended.');
        console.log();
        console.log('  The archive may include a path to the actual archive file where the file resides locally.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:upload archive.zip');
        console.log('    $ sfcc-ci instance:upload path/to/archive.zip');
        console.log('    $ sfcc-ci instance:upload archive.zip -i my-instance-alias');
        console.log('    $ sfcc-ci instance:upload archive.zip -i my-instance.demandware.net');
        console.log('    $ sfcc-ci instance:upload archive.zip -i my-instance.demandware.net '
            + '-c path/to/my/certificate.p12 -p "myPassphraseForTheCertificate"');
        console.log();
    });

program
    .command('instance:import <archive>')
    .option('-i, --instance <instance>','Instance to run the import on. Can be an instance alias. ' +
        'If not specified the currently configured instance will be used.')
    .option('-j, --json', 'Formats the output in json')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .option('-f, --failfast', 'Forces the command (if ran with --sync mode) to result in an error if the job ' +
        'on the instance exits with an error.')
    .description('Perform a instance import (aka site import) on a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        var failFast = ( options.failfast ? options.failfast : false );
        if (sync) {
            require('./lib/instance').importSync(instance, archive, asJson, failFast);
        } else {
            require('./lib/instance').import(instance, archive, asJson);
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
        console.log('    $ sfcc-ci instance:import archive.zip -j');
        console.log('    $ sfcc-ci instance:import archive.zip -s');
        console.log('    $ sfcc-ci instance:import archive.zip -s -j');
        console.log();
    });

program
    .command('code:list')
    .option('-i, --instance <instance>','Instance to get list of custom code versions from. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-j, --json', 'Formats the output in json')
    .option('-S, --sortby <sortby>', 'Sort by specifying any field')
    .description('List all custom code versions deployed on the Commerce Cloud instance')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortby ? options.sortby : null );
        require('./lib/code').list(instance, asJson, sortby);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:list');
        console.log('    $ sfcc-ci code:list -i my-instance-alias');
        console.log('    $ sfcc-ci code:list -i my-instance.demandware.net');
        console.log('    $ sfcc-ci code:list -j');
        console.log('    $ sfcc-ci code:list --sortby=id');
        console.log();
    });

program
    .command('code:deploy <archive>')
    .option('-i, --instance <instance>','Instance to deploy the custom code archive to. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-c, --certificate [certificate]','Path to the certificate to use for two factor authentication.')
    .option('-p, --passphrase [passphrase]','Passphrase to be used to read the given certificate.')
    .description('Deploys a custom code archive onto a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/webdav').deployCode(instance, archive, {
            pfx: options.certificate,
            passphrase: options.passphrase
        });
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:deploy code.zip');
        console.log('    $ sfcc-ci code:deploy code.zip -i my-instance-alias');
        console.log('    $ sfcc-ci code:deploy code.zip -i my-instance.demandware.net');
        console.log('    $ sfcc-ci code:deploy code.zip -i my-instance.demandware.net '
            + '-c path/to/my/certificate.p12 -p "myPassphraseForTheCertificate"');
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
    .option('-j, --json', 'Formats the output in json')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .option('-f, --failfast', 'Forces the command (if ran with --sync mode) to result in an error if the job ' +
        'on the instance exits with an error.')
    .description('Starts a job execution on a Commerce Cloud instance')
    .action(function(job_id, job_parameters, options) {
        var job_params = require('./lib/job').buildParameters(job_parameters);
        var instance = require('./lib/instance').getInstance(options.instance);
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        var failFast = ( options.failfast ? options.failfast : false );

        if (sync) {
            require('./lib/job').runSync(instance, job_id, {
                parameters : job_params
            }, asJson, failFast);
        } else {
            require('./lib/job').run(instance, job_id, {
                parameters : job_params
            }, asJson);
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
        console.log('    $ sfcc-ci job:run my-job -j');
        console.log('    $ sfcc-ci job:run my-job -s');
        console.log('    $ sfcc-ci job:run my-job -s -j');
        console.log();
    });

program
    .command('job:status <job_id> <job_execution_id>')
    .option('-i, --instance <instance>','Instance the job was executed on. Can be an instance alias. ' +
        'If not specified the currently configured instance will be used.')
    .option('-j, --json', 'Formats the output in json')
    .option('-l, --log', 'Stream the job log to the console')
    .option('-o, --openlogfile', 'Opens the job log file in a browser')
    .option('-v, --verbose', 'Outputs additional details of the job execution')
    .description('Get the status of a job execution on a Commerce Cloud instance')
    .action(function(job_id, job_execution_id, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var asJson = ( options.json ? options.json : false );
        var log = ( options.log ? options.log : false );
        var openlogfile = ( options.openlogfile ? options.openlogfile : false );
        var verbose = ( options.verbose ? options.verbose : false );

        require('./lib/job').status(instance, job_id, job_execution_id, verbose, log, openlogfile, asJson);
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
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -j');
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -l');
        console.log('    $ sfcc-ci job:status my-job my-job-execution-id -o');
        console.log();
    });

program
    .command('org:list')
    .description('List all orgs eligible to manage')
    .option('-o, --org <org>','Organization to get details for')
    .option('-j, --json', 'Formats the output in json')
    .option('-s, --sortby <sortby>', 'Sort by specifying any field')
    .action(function(options) {
        var org = ( options.org ? options.org : null );
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortBy ? options.sortBy : null );
        require('./lib/org').cli.list(org, asJson, sortby);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci org:list')
        console.log('    $ sfcc-ci org:list --org "my-org"')
        console.log();
    });

program
    .command('role:list')
    .description('List roles')
    .option('-i, --instance <instance>','Instance to return roles for')
    .option('-c, --count <count>','Max count of list items (default is 25)')
    .option('-r, --role <role>','Role to get details for')
    .option('-j, --json', 'Formats the output in json')
    .option('-s, --sortby <sortby>', 'Sort by specifying any field')
    .option('-v, --verbose', 'Outputs additional details of a role')
    .action(function(options) {
        var instance = ( options.instance ? require('./lib/instance').getInstance(options.instance) : null );
        var count = ( options.count ? options.count : null );
        var role = ( options.role ? options.role : null );
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortBy ? options.sortBy : null );
        var verbose = ( options.verbose ? options.verbose : false );

        if ( options.instance ) {
            require('./lib/role').cli.listLocal(instance, role, null, role, sortby, count, asJson, verbose);
        } else {
            require('./lib/role').cli.list(count, asJson);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  List roles available to grant to users. By default roles from Account Manager eligible');
        console.log('  to grant to users are returned. If the --instance option is used, roles defined on that');
        console.log('  Commerce Cloud instance are returned.');
        console.log();
        console.log('  Use --role to get details of a single role. Use --verbose to show permissions the');
        console.log('  role includes and the users on the instance granted with that role.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci role:list');
        console.log('    $ sfcc-ci role:list --instance my-instance.demandware.net');
        console.log('    $ sfcc-ci role:list --instance my-instance.demandware.net --role "Administrator"')
        console.log();
    });

program
    .command('role:grant')
    .description('Grant a role to a user')
    .option('-i, --instance <instance>','Instance to grant a user a role to')
    .option('-l, --login <login>','Login of user to grant role to')
    .option('-r, --role <role>','Role to grant')
    .option('-s, --scope <scope>','Scope of role to grant')
    .option('-j, --json', 'Formats the output in json')
    .action(function(options) {
        var instance = ( options.instance ? require('./lib/instance').getInstance(options.instance) : null );
        var login = ( options.login ? options.login : null );
        var role = ( options.role ? options.role : null );
        var scope = ( options.scope ? options.scope : null );
        var asJson = ( options.json ? options.json : false );

        if ( instance && scope ) {
            require('./lib/log').error('Ambiguous options. Use -h,--help for help.');
        } else if ( instance ) {
            require('./lib/user').cli.grantLocal(instance, login, role, asJson);
        } else {
            require('./lib/user').cli.grant(login, role, scope, asJson);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Grants a role to a user in Account Manager. Use additional --scope to grant the role');
        console.log('  to a specific scope. This allows to limit the role for a specific Commerce Cloud instance');
        console.log('  or a group of instances. Scopes are only supported by specific roles in Account Manager.');
        console.log();
        console.log('  Use --instance to grant a role to a user on a Commerce Cloud instance.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci role:grant --login the-user --role the-role');
        console.log('    $ sfcc-ci role:grant --login the-user --role the-role --scope zzzz_dev');
        console.log('    $ sfcc-ci role:grant --login the-user --role the-role --scope zzzz_*');
        console.log('    $ sfcc-ci role:grant --login the-user --role the-role --scope "zzzz_s01,zzzz_s02"');
        console.log('    $ sfcc-ci role:grant --instance my-instance.demandware.net --login the-user --role the-role');
        console.log();
    });

program
    .command('role:revoke')
    .description('Revoke a role from a user')
    .option('-i, --instance <instance>','Instance to revoke a user a role from')
    .option('-l, --login <login>','Login of user to revoke role from')
    .option('-r, --role <role>','Role to revoke')
    .option('-s, --scope <scope>','Scope of role to revoke')
    .option('-j, --json', 'Formats the output in json')
    .action(function(options) {
        var instance = ( options.instance ? require('./lib/instance').getInstance(options.instance) : null );
        var login = ( options.login ? options.login : null );
        var role = ( options.role ? options.role : null );
        var scope = ( options.scope ? options.scope : null );
        var asJson = ( options.json ? options.json : false );

        if ( instance && scope ) {
            require('./lib/log').error('Ambiguous options. Use -h,--help for help.');
        } else if ( instance ) {
            require('./lib/user').cli.revokeLocal(instance, login, role, asJson);
        } else {
            require('./lib/user').cli.revoke(login, role, scope, asJson);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Revokes a role from a user in Account Manager. Use additional --scope to reduce');
        console.log('  the scope of a role. This allows to limit the role to specific Commerce Cloud');
        console.log('  instances. Multiple instances or a range of instances can be specified.');
        console.log('');
        console.log('  Use --instance to revoke a role from a user on a Commerce Cloud instance.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci role:revoke --login the-user --role the-role');
        console.log('    $ sfcc-ci role:revoke --login the-user --role the-role --scope zzzz_dev');
        console.log('    $ sfcc-ci role:revoke --login the-user --role the-role --scope zzzz_*');
        console.log('    $ sfcc-ci role:revoke --login the-user --role the-role --scope "zzzz_s01,zzzz_s02"');
        console.log('    $ sfcc-ci role:revoke --instance my-instance.demandware.net --login the-user --role the-role');
        console.log();
    });

program
    .command('user:list')
    .description('List users eligible to manage')
    .option('-c, --count <count>','Max count of list items (default is 25)')
    .option('--start <start>','Zero-based index of first item to return (default is 0)')
    .option('-o, --org <org>','Org to return users for (only works in combination with <role>)')
    .option('-i, --instance <instance>','Instance to search users for. Can be an instance alias.')
    .option('-l, --login <login>','Login of a user to get details for')
    .option('-r, --role <role>','Limit users to a certain role')
    .option('-q, --query <query>','Query to search users for')
    .option('-j, --json', 'Formats the output in json')
    .option('-s, --sortby <sortby>', 'Sort by specifying any field')
    .action(function(options) {
        var count = ( options.count ? options.count : null );
        var start = ( options.start ? options.start : null );
        var org = options.org;
        var instance = ( options.instance ? require('./lib/instance').getInstance(options.instance) : null );
        var login = options.login;
        var role = options.role;
        var query = ( options.query ? JSON.parse(options.query) : null );
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortby ? options.sortby : null );
        if ( instance && login ) {
            // get users on the instance with role
            require('./lib/user').cli.searchLocal(instance, login, query, null, null, null, null, asJson);
        } else if ( instance && !login ) {
            // get users on instance
            require('./lib/user').cli.searchLocal(instance, login, query, role, sortby, count, start, asJson);
        } else if ( ( org && role ) || ( !org && role ) || !( org && role ) ) {
            // get users from AM
            require('./lib/user').cli.list(org, role, login, count, asJson, sortby);
        } else {
            require('./lib/log').error('Ambiguous options. Please consult the help using --help.');
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  By default users in the Account Manager organization the user is eligible');
        console.log('  to manage are being returned. Depending on the number of users the list may');
        console.log('  be large. Use option --count to limit the number of users.');
        console.log();
        console.log('  Use --login to get details of a single user.');
        console.log();
        console.log('  If options --org and --role are used, you can filter users by organization and');
        console.log('  role. --org only works in combination with --role. Only enabled users are returned.');
        console.log();
        console.log('  If option --instance is used, local users from this Commerce Cloud instance');
        console.log('  are being returned. Use --query to narrow down the users.');
        console.log();
        console.log('  Use options --instance and --login to get details of a local user on the');
        console.log('  Commerce Cloud instance.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci user:list')
        console.log('    $ sfcc-ci user:list -c 100')
        console.log('    $ sfcc-ci user:list -c 200 --start 200')
        console.log('    $ sfcc-ci user:list --sortby "lastName"')
        console.log('    $ sfcc-ci user:list --json')
        console.log('    $ sfcc-ci user:list --instance my-instance --login local-user');
        console.log('    $ sfcc-ci user:list --instance my-instance --query \'{"term_query":' +
            '{"fields":["external_id"],"operator":"is_null"}}\' --json');
        console.log('    $ sfcc-ci user:list --instance my-instance --query \'{"term_query":' +
            '{"fields":["disabled"],"operator":"is","values":[true]}}\'');
        console.log('    $ sfcc-ci user:list --instance my-instance --role Administrator');
        console.log('    $ sfcc-ci user:list --login my-login');
        console.log('    $ sfcc-ci user:list --login my-login -j');
        console.log('    $ sfcc-ci user:list --role account-admin');
        console.log('    $ sfcc-ci user:list --org my-org --role bm-user');
        console.log();
    });

program
    .command('user:create')
    .description('Create a new user')
    .option('-o, --org <org>', 'Org to create the user for')
    .option('-i, --instance <instance>','Instance to create the user on. Can be an instance alias.')
    .option('-l, --login <login>','Login of the user')
    .option('-u, --user <user>', 'User details as json')
    .option('-j, --json', 'Formats the output in json')
    .action(function(options) {
        var org = ( options.org ? options.org : null );
        var instance = ( options.instance ? require('./lib/instance').getInstance(options.instance) : null );
        var login = ( options.login ? options.login : null );
        var user = ( options.user ? JSON.parse(options.user) : null );
        var asJson = ( options.json ? options.json : false );
        if ( ( !org && !instance ) || ( org && instance ) ) {
            require('./lib/log').error('Ambiguous options. Pass either -o,--org or -i,--instance.');
        } else if ( !login ) {
            require('./lib/log').error('Login missing. Please pass a login using -l,--login.');
        } else if ( instance && login ) {
            // create locally
            require('./lib/user').cli.createLocal(instance, login, user, asJson);
        } else if ( org && login ) {
            // create in AM
            require('./lib/user').cli.create(org, user, login, null, null, asJson);
        } else {
            require('./lib/log').error('Ambiguous options. Use -h,--help for help.');
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Create a new user.');
        console.log('');
        console.log('  If an org is passed using -o,--org, the user will be created in the Account Manager');
        console.log('  for the passed org. The login (an email) must be unique. After a successful');
        console.log('  creation the user will receive a confirmation e-mail with a link to activate his');
        console.log('  account. Default roles of the user in Account Manager are "xchange-user" and "doc-user".');
        console.log('');
        console.log('  Use -i,--instance to create a local user is on the Commerce Cloud instance.');
        console.log('  The login must be unique. By default no roles will be assigned to the user on the instance.');
        console.log('');
        console.log('  You should pass details of the user in json (option -u,--user).');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci user:create --org my-org --login jdoe@email.org --user \'{"firstName":' +
            '"John", "lastName":"Doe", "roles": ["xchange-user"]}\'');
        console.log('    $ sfcc-ci user:create --instance my-instance --login "my-user" --user \'{"email":' +
            '"jdoe@email.org", "first_name":"John", "last_name":"Doe", "roles": ["Administrator"]}\'');
        console.log();
    });

program
    .command('user:update')
    .description('Update a user')
    .option('-i, --instance <instance>','Instance to update the user on. Can be an instance alias.')
    .option('-l, --login <login>','Login of the user')
    .option('-c, --changes <changes>', 'Changes to user details as json')
    .option('-j, --json', 'Formats the output in json')
    .option('-N, --noprompt','No prompt to confirm update')
    .action(function(options) {
        var instance = ( options.instance ? require('./lib/instance').getInstance(options.instance) : null );
        var login = ( options.login ? options.login : null );
        var changes = ( options.changes ? JSON.parse(options.changes) : null );
        var asJson = ( options.json ? options.json : false );
        var noPrompt = ( options.noprompt ? options.noprompt : false );

        var updateUser = function(instance, login, changes, asJson) {
            if ( instance ) {
                require('./lib/user').cli.updateLocal(instance, login, changes, asJson);
            } else {
                require('./lib/user').cli.update(login, changes, asJson);
            }
        };

        if ( !login ) {
            require('./lib/log').error('Login missing. Please pass a login using -l,--login.');
        } else if ( !changes ) {
            require('./lib/log').error('Changes missing. Please specify changes using -c,--change.');
        } else if ( noPrompt && !instance ) {
            updateUser(instance, login, changes, asJson);
        } else {
            prompt({
                type : 'confirm',
                name : 'ok',
                default : false,
                message : 'Update user ' + login + ( instance ? ' on ' + instance : '' ) + '. Are you sure?'
            }).then((answers) => {
                if (answers['ok']) {
                    updateUser(instance, login, changes, asJson);
                }
            });
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Updates an existing user');
        console.log('');
        console.log('  If --instance is not passed the user is updated in Account Manager.');
        console.log('  This requires permissions in Account Manager to adminstrate the org,');
        console.log('  the user belongs to. You should pass changes to the user details in')
        console.log('  json (option -c,--changes).');
        console.log('');
        console.log('  Pass an --instance to update a local user on a Commerce Cloud instance.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci user:update --login jdoe@email.org --changes \'{"userState": "ENABLED"}\'');
        console.log('    $ sfcc-ci user:update -i my-instance.demandware.net -l jdoe@email.org -c ' +
            '\'{"disabled": true}\'');
        console.log();
    });

program
    .command('user:delete')
    .description('Delete a user')
    .option('-i, --instance <instance>','Instance to delete the user from. Can be an instance alias.')
    .option('-l, --login <login>','Login of the user to delete')
    .option('-p, --purge','Purge the user')
    .option('-j, --json', 'Formats the output in json')
    .option('-N, --noprompt','No prompt to confirm deletion')
    .action(function(options) {
        var instance = ( options.instance ? require('./lib/instance').getInstance(options.instance) : null );
        var login = options.login;
        var purge = ( options.purge ? options.purge : false );
        var asJson = ( options.json ? options.json : false );
        var noPrompt = ( options.noprompt ? options.noprompt : false );

        var deleteUser = function(instance, login, purge, asJson) {
            if ( instance ) {
                require('./lib/user').cli.deleteLocal(instance, login, asJson);
            } else {
                require('./lib/user').cli.delete(login, purge, asJson);
            }
        };

        if ( !login ) {
            require('./lib/log').error('Missing required --login. Use -h,--help for help.');
        } else if ( noPrompt ) {
            deleteUser(instance, login, purge, asJson);
        } else {
            prompt({
                type : 'confirm',
                name : 'ok',
                default : false,
                message : ( purge ? 'Purge' : 'Delete' ) + ' user ' + login + ( instance ? ' on ' + instance : '' ) +
                    '. Are you sure?'
            }).then((answers) => {
                if (answers['ok']) {
                    deleteUser(instance, login, purge, asJson);
                }
            });
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Delete a user.');
        console.log('');
        console.log('  If --instance is not passed the user is deleted in Account Manager.');
        console.log('  This requires permissions in Account Manager to adminstrate the org,');
        console.log('  the user belongs to. The user is only marked as deleted and cannot');
        console.log('  log into Account Manager anymore.');
        console.log('  Use option --purge to completely purge the user.');
        console.log('');
        console.log('  Pass an --instance to delete a local user from a Commerce Cloud instance.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci user:delete --login jdoe@email.org');
        console.log('    $ sfcc-ci user:delete --instance my-instance.demandware.net --login jdoe@email.org');
        console.log('    $ sfcc-ci user:delete --login jdoe@email.org --purge');
        console.log();
    });


program.on('--help', function() {
    console.log('');
    console.log('  Environment:');
    console.log('');
    console.log('    $SFCC_LOGIN_URL         set login url used for authentication');
    console.log('    $SFCC_OAUTH_LOCAL_PORT  set Oauth local port for authentication flow');
    console.log('    $SFCC_SANDBOX_API_HOST  set sandbox API host');
    console.log('    $DEBUG                  enable verbose output');
    console.log('');
    console.log('  Detailed Help:');
    console.log('');
    console.log('    Use sfcc-ci <sub:command> --help to get detailed help and example usage of sub:commands');
    console.log('');
    console.log('  Useful Resources:');
    console.log('');
    console.log('    Salesforce Commerce Cloud CLI Release Notes: https://sfdc.co/sfcc-cli-releasenotes');
    console.log('    Salesforce Commerce Cloud CLI Readme: https://sfdc.co/sfcc-cli-readme');
    console.log('    Salesforce Commerce Cloud CLI Cheatsheet: https://sfdc.co/sfcc-cli-cheatsheet');
    console.log('    Salesforce Commerce Cloud Account Manager: https://account.demandware.com');
    console.log('    Salesforce Commerce Cloud API Explorer: https://api-explorer.commercecloud.salesforce.com');
    console.log('    Salesforce Commerce Cloud Documentation: https://documentation.b2c.commercecloud.salesforce.com');
    console.log('');
});

program.parse(process.argv);

if (!program.args.length) {
    program.help();
} else if ( typeof(program.args[program.args.length-1]) !== 'object') {
    // the last argument represents the command,
    // if this is not a known Command, exit with error
    require('./lib/log').error('Unknown command `%s`. Use `sfcc-ci --help` for help.', program.args[0]);
    process.exitCode = 1;
}