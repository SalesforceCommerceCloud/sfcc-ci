#!/usr/bin/env node
var program = require('commander');

program
    .version(require('./package.json').version, '-V, --version')
    .option('-D, --debug', 'enable verbose output', function() {
        process.env.DEBUG = true;
        process.env.NODE_DEBUG = 'request';
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
    .command('sandbox:realms [realm]')
    .description('List realms eligible to manage sandboxes for')
    .option('-j, --json','Formats the output in json')
    .option('-S, --sortby <sortby>', 'Sort by specifying any field')
    .action(function(realm, options) {
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortby ? options.sortby : null );
        require('./lib/sandbox').cli.realms(realm, asJson, sortby);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Pass the optional [realm] parameter to get details of a single realm such as quotas and usage');
        console.log('  information of sandboxes.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:realms');
        console.log('    $ sfcc-ci sandbox:realms --json');
        console.log('    $ sfcc-ci sandbox:realms zzzz');
        console.log('    $ sfcc-ci sandbox:realms zzzz --json');
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
    .command('sandbox:create <realm> [alias]')
    .option('-t, --ttl <hours>','Number of hours the sandbox will live')
    .option('-j, --json','Formats the output in json')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .option('-d, --default', 'Sets the created sandbox as default instance.')
    .description('Create a new sandbox')
    .action(function(realm, alias, options) {
        var ttl = ( options.ttl ? options.ttl : null );
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        var setAsDefault = ( options.default ? options.default : false );
        require('./lib/sandbox').cli.create(realm, alias, ttl, asJson, sync, setAsDefault);
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
        console.log();
        console.log('  The TTL (time to live) in hours of the sandbox can be modified via the --ttl flag. The value');
        console.log('  must adhere to the maximum TTL quotas) If absent the realms default sandbox TTL is used.');
        console.log('  If the sandbox age reaches its TTL, it will be deleted automatically.');
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
        console.log('    $ sfcc-ci sandbox:create my-realm --ttl 6');
        console.log();
    });

program
    .command('sandbox:get <sandbox_id>')
    .description('Get detailed information about a sandbox')
    .option('-j, --json','Formats the output in json')
    .option('-h, --host','Return the host name of the sandbox')
    .option('-O, --open','Opens a browser with the Business Manager on the sandbox')
    .action(function(sandbox_id, options) {
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split('-');
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        var asJson = ( options.json ? options.json : false );
        var hostOnly = ( options.host ? options.host : false );
        var openBrowser = ( options.open ? options.open : false );
        require('./lib/sandbox').cli.get(spec, asJson, hostOnly, openBrowser);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The sandbox to lookup must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <sandbox_id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:get my-sandbox-id');
        console.log('    $ sfcc-ci sandbox:get my-sandbox-id -j');
        console.log('    $ sfcc-ci sandbox:get my-sandbox-id -h');
        console.log('    $ sfcc-ci sandbox:get my-sandbox-id -O');
        console.log();
    });

program
    .command('sandbox:start <sandbox_id>')
    .description('Start a sandbox')
    .action(function(sandbox_id, options) {
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split('-');
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
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <sandbox_id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:start my-sandbox-id');
        console.log();
    });

program
    .command('sandbox:stop <sandbox_id>')
    .description('Stop a sandbox')
    .action(function(sandbox_id, options) {
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split('-');
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
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <sandbox_id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:stop my-sandbox-id');
        console.log();
    });

program
    .command('sandbox:restart <sandbox_id>')
    .description('Restart a sandbox')
    .action(function(sandbox_id, options) {
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split('-');
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
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <sandbox_id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:restart my-sandbox-id');
        console.log();
    });

program
    .command('sandbox:reset <sandbox_id>')
    .description('Reset a sandbox')
    .action(function(sandbox_id, options) {
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split('-');
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        require('./lib/sandbox').cli.reset(spec, false);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  WARNING: This is a destructive operation and you will loose any data stored on the sandbox.');
        console.log();
        console.log('  The sandbox to reset must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <sandbox_id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:reset my-sandbox-id');
        console.log();
    });

program
    .command('sandbox:remove <sandbox_id>')
    .description('Triggers the removal of an existing sandbox')
    .action(function(sandbox_id, options) {
        // always assume it is a sandbox id
        var spec = { id : sandbox_id };
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox_id.split('-');
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        }
        require('./lib/sandbox').cli.remove(spec);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  WARNING: This is a destructive operation and you will loose any data stored on the sandbox.');
        console.log();
        console.log('  The sandbox to remove must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes. You must have permission to remove a sandbox. The command');
        console.log('  only triggers the deletion and does not wait until the sandbox is fully removed. Use may use');
        console.log('  `sfcc-ci sandbox:list` to check the status of the removal.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <sandbox_id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:remove my-sandbox-id');
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
    .description('Perform a instance import (aka site import) on a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        if (sync) {
            require('./lib/instance').importSync(instance, archive, asJson);
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
    .description('Starts a job execution on a Commerce Cloud instance')
    .action(function(job_id, job_parameters, options) {
        var job_params = require('./lib/job').buildParameters(job_parameters);
        var instance = require('./lib/instance').getInstance(options.instance);
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );

        if (sync) {
            require('./lib/job').runSync(instance, job_id, {
                parameters : job_params
            }, asJson);
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