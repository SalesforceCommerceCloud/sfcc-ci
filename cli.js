#!/usr/bin/env node
/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
var colors = require('colors');
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
        console.log();
        console.log('  If not passed the API key is being looked up in a dw.json file in the current working');
        console.log('  You may use environment variable SFCC_OAUTH_CLIENT_ID to pass the API key alternatively.');
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
        console.log('    $ sfcc-ci auth:login');
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
        console.log('  from a dw.json file located in the current working directory. You can make use of environment');
        console.log('  variables SFCC_OAUTH_CLIENT_ID and SFCC_OAUTH_CLIENT_SECRET to pass the API key and secret.');
        console.log();
        console.log('  If user credentials are not provided, they are read from a dw.json file located in the')
        console.log('  current working directory. You may use environment variables SFCC_OAUTH_USER_NAME and');
        console.log('  SFCC_OAUTH_USER_PASSWORD to pass the user credentails alternatively.');
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
    .command('data:upload')
    .option('-i, --instance <instance>','Instance to upload the file to. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-t, --target <target>', 'Target (WebDAV) location to upload to')
    .option('-f, --file <file>', 'File to upload')
    .option('-c, --certificate <certificate>','Path to the certificate to use for two factor authentication.')
    .option('-p, --passphrase <passphrase>','Passphrase to be used to read the given certificate.')
    .description('Uploads a file onto a Commerce Cloud instance')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var target = ( options.target ? options.target : null );
        if (!target) {
            this.missingArgument('target');
            return;
        }
        var file = ( options.file ? options.file : null );
        if (!file) {
            this.missingArgument('file');
            return;
        }
        require('./lib/webdav').cli.upload(instance, '/' + target, file, true, {
            pfx: options.certificate,
            passphrase: options.passphrase
        });
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Uploads the file onto an instance into the target WebDAV folder.');
        console.log('  Note, that there is a max file size of 100 MB for uploading files. You may');
        console.log('  want to zip or gzip the file to upload.');
        console.log();
        console.log('  The file may include a path to the actual location where the file resides locally.');
        console.log('  The provided --target <target> is relative to /webdav/Sites/, e.g. "impex/src/upload".');
        console.log();
        console.log('  Supported top level --target are "impex", "static", "catalogs", "libraries" and "dynamic".');
        console.log('  In order to use "catalogs", "libraries" and "dynamic" you have to set API permissions for');
        console.log('  a specific catalog, library or dynamic folder in WebDAV Client Permissions.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci data:upload --instance my-instance.demandware.net --target impex/src/upload ' +
            '--file data.xml');
        console.log('    $ sfcc-ci data:upload --instance my-instance.demandware.net --target impex/src/instance ' +
            '--file site-import.zip');
        console.log();
    });

program
    .command('sandbox:realm:list')
    .description('List realms eligible to manage sandboxes for')
    .option('-r, --realm <realm>','Realm to get details for')
    .option('--show-usage', 'Whether to return detailed usage data')
    .option('-j, --json','Formats the output in json')
    .action(function(options) {
        var realm = ( options.realm ? options.realm : null );
        var asJson = ( options.json ? options.json : false );
        var topic = ( options.showUsage ? 'usage' : null );
        require('./lib/sandbox').cli.realm.list(realm, topic, asJson);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Use --realm <realm> to get details of a single realm such as configuration and usage');
        console.log('  information about sandboxes. Use --usage to retrieve detailed usage information of');
        console.log('  sandboxes in that realm.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:realm');
        console.log('    $ sfcc-ci sandbox:realm --json');
        console.log('    $ sfcc-ci sandbox:realm --realm zzzz');
        console.log('    $ sfcc-ci sandbox:realm --realm zzzz --json');
        console.log('    $ sfcc-ci sandbox:realm --realm zzzz --show-usage');
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
    .option('--show-deleted', 'Whether to include deleted sandboxes')
    .option('-j, --json','Formats the output in json')
    .option('-S, --sortby <sortby>', 'Sort by specifying any field')
    .action(function(options) {
        var showDeleted = ( options.showDeleted ? true : false );
        var asJson = ( options.json ? options.json : false );
        var sortby = ( options.sortby ? options.sortby : null );
        require('./lib/sandbox').cli.list(showDeleted, asJson, sortby);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:list');
        console.log('    $ sfcc-ci sandbox:list --show-deleted');
        console.log('    $ sfcc-ci sandbox:list --json');
        console.log();
    });

program
    .command('sandbox:ips')
    .description('List inbound and outbound IP addresses for sandboxes')
    .option('-j, --json','Formats the output in json')
    .action(function(options) {
        var asJson = ( options.json ? options.json : false );
        require('./lib/sandbox').cli.ips(asJson);
    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:ips');
        console.log('    $ sfcc-ci sandbox:ips --json');
        console.log();
    });

program
    .command('sandbox:create')
    .option('-r, --realm <realm>','Realm to create the sandbox for')
    .option('-t, --ttl <hours>','Number of hours the sandbox will live')
    .option('--auto-scheduled', 'Sets the sandbox as being auto scheduled')
    .option('-p, --profile <profile>','Resource profile used for the sandbox, "medium" is the default')
    .option('--ocapi-settings <json>','Additional OCAPI settings applied to the sandbox')
    .option('--webdav-settings <json>','Additional WebDAV permissions applied to the sandbox')
    .option('-j, --json','Formats the output in json')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .option('-d, --default', 'Sets the created sandbox as default instance.')
    .option('-a, --set-alias <alias>','Instance alias to create for the sandbox')
    .description('Create a new sandbox')
    .action(function(options) {
        var realm = ( options.realm ? options.realm : null );
        var ttl = ( options.ttl ? parseInt(options.ttl) : null );
        var autoScheduled = ( options.autoScheduled ? options.autoScheduled : false );
        var profile = ( options.profile ? options.profile : null );
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        var setAsDefault = ( options.default ? options.default : false );
        var alias = ( options.setAlias ? options.setAlias : null );
        var ocapiSettings = ( options.ocapiSettings ? options.ocapiSettings : null );
        var webdavSettings = ( options.webdavSettings ? options.webdavSettings : null );
        require('./lib/sandbox').cli.create(realm, alias, ttl, profile, autoScheduled, ocapiSettings, webdavSettings,
            asJson, sync, setAsDefault);
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
        console.log('  The --auto-scheduled flag controls if the sandbox is being auto scheduled according to the');
        console.log('  schedule configured at sandbox realm level. By default or if omitted the sandbox is not auto');
        console.log('  scheduled.');
        console.log();
        console.log('  Use the optional --profile <profile> to set the resource allocation for the sandbox, "medium"');
        console.log('  is the default. Be careful, more powerful profiles consume more credits. Supported values');
        console.log('  are: medium, large, xlarge.');
        console.log();
        console.log('  You can force the command to wait until the creation of the sandbox has been finished and the');
        console.log('  sandbox is available to use (in "started" status) by using the --sync flag. By default the');
        console.log('  command will poll the status for 10 minutes. You can overwrite this by using the environment');
        console.log('  variable SFCC_SANDBOX_API_POLLING_TIMEOUT to set another timeout in minutes.')
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
        console.log();
        console.log('  Use --ocapi-settings and --webdav-settings to pass additional OCAPI and/or WebDAV settings to');
        console.log('  the created sandbox as JSON. You may not overwrite the permissions for the CLI client but');
        console.log('  amend its permissions or add permissions for other clients. The passed JSON must be valid.');
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
        console.log('    $ sfcc-ci sandbox:create -r my-realm --auto-scheduled');
        console.log('    $ sfcc-ci sandbox:create -r my-realm -p large');
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
    .option('--show-storage','Display detailed storage information')
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
        var topic = null;
        if ( options.showOperations ) {
            topic = 'operations';
        } else if ( options.showUsage ) {
            topic = 'usage';
        } else if ( options.showSettings ) {
            topic = 'settings';
        } else if ( options.showStorage ) {
            topic = 'storage';
        }
        require('./lib/sandbox').cli.get(spec, asJson, hostOnly, openBrowser, topic);
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
        console.log('  applied to the sandbox during creation. Use --show-storage to retrieve detailed storage');
        console.log('  capacity.');
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
        console.log('    $ sfcc-ci sandbox:get -s my-sandbox-id --show-storage');
        console.log();
    });

program
    .command('sandbox:update')
    .option('-s, --sandbox <id>','sandbox to update')
    .option('-t, --ttl <hours>','number of hours to add to the sandbox lifetime')
    .option('--auto-scheduled <flag>','Sets the sandbox as being auto scheduled')
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
        var autoScheduled = ( options.autoScheduled !== null ?
            ( options.autoScheduled === 'true' ? true : false ) : null );
        require('./lib/sandbox').cli.update(spec, ttl, autoScheduled, false);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The TTL (time to live) in hours of the sandbox can be prolonged via the --ttl flag. The value');
        console.log('  must, together with previous prolongiations, adhere to the maximum TTL quotas). If set to 0 or');
        console.log('  less the sandbox will have an infinite lifetime.');
        console.log();
        console.log('  The --auto-scheduled flag controls if the sandbox is being autoscheduled according to the');
        console.log('  schedule configured at sandbox realm level.');
        console.log();
        console.log('  The sandbox to update must be identified by its id. Use may use `sfcc-ci sandbox:list` to');
        console.log('  identify the id of your sandboxes.');
        console.log();
        console.log('  You can also pass the realm and the instance (e.g. zzzz-s01) as <id>.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:update --sandbox my-sandbox-id --ttl 8');
        console.log('    $ sfcc-ci sandbox:update --sandbox my-sandbox-id --auto-scheduled true');
        console.log('    $ sfcc-ci sandbox:update --sandbox my-sandbox-id --auto-scheduled false');
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
    .command('sandbox:alias:add')
    .option('-s, --sandbox <id>','sandbox to create alias for')
    .option('-h, --host <host>','hostname alias to register')
    .option('-j, --json', 'Optional, formats the output in json')
    .description('Registers a hostname alias for a sandbox.')
    .action(function(options) {
        var sandbox = options.sandbox;
        if (!sandbox) {
            this.missingArgument('sandbox');
            return;
        }
        var spec = {};
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        } else {
            // assume it is a sandbox id
            spec = { id : sandbox };
        }
        var aliasName = options.host;
        if (!aliasName) {
            this.missingArgument('host');
            return;
        }
        var asJson = ( options.json ? options.json : false );
        require('./lib/sandbox').cli.alias.create(spec, aliasName, asJson);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Registers a hostname alias for a sandbox. This will open a registration link in your browser');
        console.log('  as soon as you have inserted the domain and a given target IP in your etc/hosts file. ');
        console.log('  Note that you also have to include the hostname in your site alias configuration in Business');
        console.log('  Manager to make the following redirect to your storefront working.');
        console.log('');
        console.log('  Use --json to only print the created alias incl. the registration link.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:alias:add -s my-sandbox-id -h sbx1.merchant.com');
        console.log('    $ sfcc-ci sandbox:alias:add -s my-sandbox-id -h sbx1.merchant.com -j');
        console.log();
    });

program
    .command('sandbox:alias:list')
    .option('-s, --sandbox <id>','sandbox to list hostname aliases for')
    // can not use '--alias' here because of: https://github.com/tj/commander.js/issues/183
    // and https://github.com/tj/commander.js/issues/592
    .option('-a, --aliasid <aliasid>','Optional ID of the hostname alias to only get a single one')
    .option('-j, --json', 'Optional, formats the output in json')
    .description('Lists all hostname aliases, which are registered for the given sandbox.')
    .action(function(options) {
        var sandbox = options.sandbox;
        if (!sandbox) {
            this.missingArgument('sandbox');
            return;
        }
        var spec = {};
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        } else {
            // assume it is a sandbox id
            spec = { id : sandbox };
        }
        var asJson = ( options.json ? options.json : false );
        var aliasId = options.aliasid;
        if (!aliasId) {
            require('./lib/sandbox').cli.alias.list(spec, asJson);
        } else {
            require('./lib/sandbox').cli.alias.get(spec, aliasId, asJson);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Lists all hostname aliases for the given sandbox with their registration link or retrieves');
        console.log('  a single one and call the registration link for it.');
        console.log('');
        console.log('  Use --json to only print the alias details incl. the registration link.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:alias:list -s my-sandbox-id');
        console.log('    $ sfcc-ci sandbox:alias:list -s my-sandbox-id -a 83f05593-6272-...');
        console.log('    $ sfcc-ci sandbox:alias:list -s my-sandbox-id --json');
        console.log();
    });

program
    .command('sandbox:alias:delete')
    .option('-s, --sandbox <id>','sandbox to delete the hostname alias for')
    // can not use '--alias' here because of: https://github.com/tj/commander.js/issues/183
    // and https://github.com/tj/commander.js/issues/592
    .option('-a, --aliasid <aliasid>','ID of the hostname alias to delete')
    .option('-N, --noprompt','No prompt to confirm delete')
    .option('-j, --json', 'Optional, formats the output in json')
    .description('Removes a sandbox alias by its ID')
    .action(function(options) {
        var sandbox = options.sandbox;
        if (!sandbox) {
            this.missingArgument('sandbox');
            return;
        }
        var spec = {};
        // check if we have to lookup the sandbox by realm and instance
        var split = sandbox.split(/[-_]/);
        if (split.length === 2) {
            spec['realm'] = split[0];
            spec['instance'] = split[1];
        } else {
            // assume it is a sandbox id
            spec = { id : sandbox };
        }
        var aliasId = options.aliasid;
        if (!aliasId) {
            this.missingArgument('aliasid');
            return;
        }
        var asJson = ( options.json ? options.json : false );

        var noPrompt = ( options.noprompt ? options.noprompt : false );
        if ( noPrompt ) {
            require('./lib/sandbox').cli.alias.delete(spec, aliasId, asJson);
        } else {
            prompt({
                type : 'confirm',
                name : 'ok',
                default : false,
                message : 'Delete sandbox alias ' + aliasId + '. Are you sure?'
            }).then((answers) => {
                if (answers['ok']) {
                    require('./lib/sandbox').cli.alias.delete(spec, aliasId, false);
                }
            });
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Deletes a hostname alias from the sandbox by its ID. Use `sfcc-ci sandbox:alias:list`');
        console.log('  to get all registered sandbox aliases.');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci sandbox:alias:delete -s my-sandbox-id -a 83f05593-6272-...');
        console.log('    $ sfcc-ci sandbox:alias:delete -s my-sandbox-id -a 83f05593-6272-... --noprompt');
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
    .option('-c, --certificate <certificate>','Path to the certificate to use for two factor authentication.')
    .option('-p, --passphrase <passphrase>','Passphrase to be used to read the given certificate.')
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
    .command('instance:export')
    .option('-i, --instance <instance>','Instance to run the export on. Can be an instance alias. ' +
        'If not specified the currently configured instance will be used.')
    .option('-j, --json', 'Formats the output in json')
    .option('-d, --data <data>', 'Set of data as parameter or file specified in JSON format for what to export')
    .option('-f, --file <file>', 'File to store exported data to, relative to impex/src/instance')
    .option('-j, --json', 'Formats the output in json')
    .option('-s, --sync', 'Operates in synchronous mode and waits until the operation has been finished.')
    .option('-f, --failfast', 'Forces the command (if ran with --sync mode) to result in an error if the job ' +
        'on the instance exits with an error.')
    .description('Run an instance export')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var data = require('./lib/export').readExportJson(options.data);
        if (!data) {
            this.missingArgument('data');
            return;
        }
        var file = ( options.file ? options.file : null );
        if (!file) {
            this.missingArgument('file');
            return;
        }
        var asJson = ( options.json ? options.json : false );
        var sync = ( options.sync ? options.sync : false );
        var failFast = ( options.failfast ? options.failfast : false );
        if (sync) {
            require('./lib/instance').exportSync(instance, data, file, asJson, failFast);
        } else {
            require('./lib/instance').export(instance, data, file, asJson);
        }
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  Performs an instance export of the data on an instance into a file for download. The data');
        console.log('  units to export can be controlled via option --data in JSON format. The data may be:');
        console.log();
        console.log('   {');
        console.log('        "catalog_static_resources": {');
        console.log('            "<catalog-id>": true },');
        console.log('            "all" : true');
        console.log('        },');
        console.log('        "catalogs": {');
        console.log('            "<catalog-id>": true },');
        console.log('            "all" : true');
        console.log('        },');
        console.log('        "customer_lists": {');
        console.log('            "<customer-list-id>": true,,');
        console.log('            "all" : true');
        console.log('        },');
        console.log('        "global_data" : {');
        console.log('            "access_roles" : true,');
        console.log('            "all" : true,');
        console.log('            "csc_settings" : true,');
        console.log('            "csrf_whitelists" : true,');
        console.log('            "custom_preference_groups" : true,');
        console.log('            "custom_quota_settings" : true,');
        console.log('            "custom_types" : true,');
        console.log('            "geolocations" : true,');
        console.log('            "global_custom_objects" : true,');
        console.log('            "job_schedules" : true,');
        console.log('            "job_schedules_deprecated" : true,');
        console.log('            "locales" : true,');
        console.log('            "meta_data" : true,');
        console.log('            "oauth_providers" : true,');
        console.log('            "ocapi_settings" : true,');
        console.log('            "page_meta_tags" : true,');
        console.log('            "preferences" : true,');
        console.log('            "price_adjustment_limits" : true,');
        console.log('            "services" : true,');
        console.log('            "sorting_rules" : true,');
        console.log('            "system_type_definitions" : true,');
        console.log('            "static_resources" : true,');
        console.log('            "users" : true,');
        console.log('            "webdav_client_permissions" : true');
        console.log('       },');
        console.log('        "inventory_lists": {');
        console.log('            "<inventory-list-id>": true },');
        console.log('            "all" : true');
        console.log('        },');
        console.log('       "libraries": {');
        console.log('            "<library-id>": true },');
        console.log('            "all" : true');
        console.log('       },');
        console.log('       "library_static_resources": {');
        console.log('            "<library-id>": true },');
        console.log('            "all" : true');
        console.log('       },');
        console.log('       "price_books": {');
        console.log('            "<pricebook-id>": true },');
        console.log('            "all" : true');
        console.log('       },');
        console.log('       "sites" : {');
        console.log('           "<site-id>" : {');
        console.log('               "ab_tests" : true,');
        console.log('               "active_data_feeds" : true,');
        console.log('               "all" : true');
        console.log('               "cache_settings" : true,');
        console.log('               "campaigns_and_promotions" : true,');
        console.log('               "content" : true,');
        console.log('               "coupons" : true,');
        console.log('               "custom_objects" : true,');
        console.log('               "customer_cdn_settings" : true,');
        console.log('               "customer_groups" : true,');
        console.log('               "distributed_commerce_extensions" : true,');
        console.log('               "dynamic_file_resources" : true,');
        console.log('               "gift_certificates" : true,');
        console.log('               "ocapi_settings" : true,');
        console.log('               "payment_methods" : true,');
        console.log('               "payment_processors" : true,');
        console.log('               "redirect_urls" : true,');
        console.log('               "search_settings" : true,');
        console.log('               "shipping" : true,');
        console.log('               "site_descriptor" : true,');
        console.log('               "site_preferences" : true,');
        console.log('               "sitemap_settings" : true,');
        console.log('               "slots" : true,');
        console.log('               "sorting_rules" : true,');
        console.log('               "source_codes" : true,');
        console.log('               "static_dynamic_alias_mappings" : true,');
        console.log('               "stores" : true,');
        console.log('               "tax" : true,');
        console.log('               "url_rules" : true');
        console.log('           },');
        console.log('           "all" : { ... }');
        console.log('       }');
        console.log('   }');
        console.log();
        console.log('  The keyword "all" can be used as wildcard to match all objects of a certain type or all');
        console.log('  units respectively.');
        console.log();
        console.log('  The file name to save the exported data to must be provided as --file. If the file does');
        console.log('  not have file extension *.zip it will be appended.');
        console.log();
        console.log('  If a file with the same name already exists on the instance, the export will not be done');
        console.log('  and the existing file will not be overwritten.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci instance:export -i my-instance.demandware.net -d \'{"sites":{"all":true}} ' +
            '-f all_sites.xml\'');
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
        require('./lib/code').cli.list(instance, asJson, sortby);
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
    .option('-a, --activate', 'Whether to activate the deployed code version, false by default')
    .option('-c, --certificate <certificate>','Path to the certificate to use for two factor authentication.')
    .option('-p, --passphrase <passphrase>','Passphrase to be used to read the given certificate.')
    .description('Deploys a custom code archive onto a Commerce Cloud instance')
    .action(function(archive, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var activate = ( options.activate ? options.activate : false );
        require('./lib/code').cli.deploy(instance, archive, {
            pfx: options.certificate,
            passphrase: options.passphrase
        }, activate);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log();
        console.log('  The deployed archive file will be unpacked on the instance. It is recommended to use');
        console.log('  a top level folder as the code version containing the cartridges:');
        console.log('');
        console.log('  code_version.zip');
        console.log('    |-- code_version');
        console.log('      |-- cartridge1');
        console.log('      |-- cartridge2');
        console.log('      |-- cartridge3');
        console.log('');
        console.log('  Use the optional --activate flag to activate the deployed code version. This assumes');
        console.log('  that the deployed archive file has the same name as the enclosed code version.');
        console.log('');
        console.log('  If you deploy to staging and make use of a certificate file the instance host name');
        console.log('  (e.g. cert.staging.realm.org.demandware.net) will be modified for the subsequent activation');
        console.log('  (e.g. staging.realm.org.demandware.net).');
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:deploy code_version.zip');
        console.log('    $ sfcc-ci code:deploy code_version.zip -i my-instance-alias');
        console.log('    $ sfcc-ci code:deploy code_version.zip -i my-instance.demandware.net');
        console.log('    $ sfcc-ci code:deploy code_version.zip -i my-instance.demandware.net '
            + '-c path/to/my/certificate.p12 -p "myPassphraseForTheCertificate"');
        console.log('    $ sfcc-ci code:deploy code_version.zip --activate');
        console.log();
    });

program
    .command('code:activate <version>')
    .option('-i, --instance <instance>','Instance to activate the custom code version on. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .description('Activate the custom code version on a Commerce Cloud instance')
    .action(function(version, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/code').cli.activate(instance, version);
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
    .command('code:delete')
    .option('-c, --code <code>','Code version to delete')
    .option('-i, --instance <instance>','Instance to delete the code version from. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-N, --noprompt','No prompt to confirm deletion')
    .option('-j, --json', 'Formats the output in json')
    .description('Delete a custom code version')
    .action(function(options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var code = ( options.code ? options.code : null );
        var noPrompt = ( options.noprompt ? options.noprompt : false );
        var asJson = ( options.json ? options.json : false )

        if ( !code ) {
            require('./lib/log').error('Code version missing. Please pass a code version using -c,--code.');
        } else if ( !instance ) {
            require('./lib/log').error('Instance missing. Please pass an instance using -i,--instance.');
        } else if ( noPrompt ) {
            require('./lib/code').cli.delete(instance, code, asJson);
        } else {
            prompt({
                type : 'confirm',
                name : 'ok',
                default : false,
                message : 'Delete code version ' + code + ' on ' + instance + '. Are you sure?'
            }).then((answers) => {
                if (answers['ok']) {
                    require('./lib/code').cli.delete(instance, code, asJson);
                }
            });
        }

    }).on('--help', function() {
        console.log('');
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:delete --code version1');
        console.log('    $ sfcc-ci code:delete --code version1 -i my-instance.demandware.net');
        console.log('    $ sfcc-ci code:delete --code version1 -i my-instance.demandware.net --noprompt');
        console.log();
    });

program
    .command('code:manifest:generate <localdirectorypaths>')
    .option('-g, --ignore <ignore>', 'Ignore patterns for files which should not be part of the ' +
        'generated manifest (i.e. unit tests, code coverage...). Comma-separated list of patterns')
    .option('-o, --output <output>', 'Directory path to where to generate the manifest file. ' +
        'If not specified, process.cwd() is used.')
    .description('Generates the manifest file based on the given local directories. ')
    .action((localdirectorypaths, options) => {
        const ignorePatterns = options.ignore ? options.ignore.split(',') : [];
        require('./lib/manifest').generate(
            localdirectorypaths.split(','),
            ignorePatterns,
            options.output
        ).catch(err => {
            console.log(colors.red(err))
            process.exit(-1);
        });
    }).on('--help', () => {
        console.log();
        console.log('  Details:');
        console.log();
        console.log('  This command will generate a new manifest file based on the given local directories.');
        console.log('  You can specify where to generate this file so that store it at the root level ' +
            'of your cartridges folder, prior to zip all these files and deploy them.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:manifest:generate "/path/to/repo1,/path/to/repo2"');
        console.log('    $ sfcc-ci code:manifest:generate "/path/to/repo1,/path/to/repo2" -g "tests/**/*"');
        console.log('    $ sfcc-ci code:manifest:generate "/path/to/repo1,/path/to/repo2" ' +
            '-g "tests/**/*" -o "/path/to/destination/file"');
        console.log();
    });

program
    .command('code:compare <localdirectorypaths>')
    .option('-i, --instance <instance>','Instance to activate the custom code version on. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-s, --sourcecodeversion <sourcecodeversion>', 'Code version on the instance which should be used ' +
        'as source for the deployment.')
    .option('-m, --manifestfilename <manifestfilename>', 'The name of the remote manifest file. If not provided, ' +
        'the manifest.FILENAME constant is used.')
    .option('-g, --ignore <ignore>', 'Ignore patterns for files which should not be compared (i.e. unit tests ' +
        ', code coverage...). Comma-separated list of glob patterns')
    .option('-f, --file', 'Generate results into an HTML file instead of writing those in the console')
    .option('-o, --override', 'Override the remote manifest with the new version from the instance ' +
        'in case one exists if specified')
    .option('-r, --removeafter', 'Remove the generated manifest files once completed')
    .option('-c, --certificate <certificate>','Path to the certificate to use for two factor authentication.')
    .option('-p, --passphrase <passphrase>','Passphrase to be used to read the given certificate.')
    .option('-v, --verbose', 'Verbose mode')
    .description('Compare the given local directories with the given code version ' +
        '(or the active one if none specified) of the Commerce Cloud instance and provide a diff between the two.')
    .action((localdirectorypaths, options) => {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/code').cli.compare(instance, localdirectorypaths, {
            sourceCodeVersion: options.sourcecodeversion,
            manifestFileName: options.manifestfilename,
            pfx: options.certificate,
            passphrase: options.passphrase,
            overrideLocalFile: options.override,
            ignorePatterns: options.ignore,
            outputFile: options.file,
            removeFilesAfter: options.removeafter,
            verbose: options.verbose
        }).catch(err => {
            console.log(colors.red(err))
            process.exit(-1);
        });
    }).on('--help', () => {
        console.log();
        console.log('  Details:');
        console.log();
        console.log('  This command will compare the content of the cartridges within the local directories ' +
            'sent as parameter with the active code version on the instance.');
        console.log('  This comparison is based on a manifest files, generated at deployment stage ' +
            '(this manifest is stored at root level of the archive deployed to the instance).');
        console.log('  This command generates a download the remote manifest, ' +
            'generates a local one, and compare the two.');
        console.log('  Here are the exact steps executed in the following order:');
        console.log('  1. Get the active code version (if it does not exist or ' +
            'there is an issue while connecting, abort)');
        console.log('  2. Download the manifest file from the code version (if it does not exist, abort)');
        console.log('  3. Generate a local manifest (if there is any issue finding files, abort)');
        console.log('  4. Compare the remove and local manifests and display data into the console');
        console.log('  5. Remove the manifests files (if --removeafter option is passed)');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:compare "/path/to/repo1,/path/to/repo2"');
        console.log('    $ sfcc-ci code:compare "/path/to/repo1,/path/to/repo2" -i my-instance-alias');
        console.log('    $ sfcc-ci code:compare "/path/to/repo1,/path/to/repo2" -i my-instance.demandware.net');
        console.log('    $ sfcc-ci code:compare "/path/to/repo1,/path/to/repo2" ' +
            '-i my-instance.demandware.net -f -r -v');
        console.log('    $ sfcc-ci code:compare "/path/to/repo1,/path/to/repo2" ' +
            '-i my-instance.demandware.net -c path/to/my/certificate.p12 -p "myPassphraseForTheCertificate"');
        console.log();
    });

program
    .command('code:deploy:diff <codeversion> <localdirectorypaths>')
    .option('-i, --instance <instance>', 'Instance to activate the custom code version on. Can be an ' +
        'instance alias. If not specified the currently configured instance will be used.')
    .option('-s, --sourcecodeversion <sourcecodeversion>', 'Code version on the instance which should be used ' +
        'as source for the deployment.')
    .option('-m, --manifestfilename <manifestfilename>', 'The name of the remote manifest file. If not provided, ' +
        'the manifest.FILENAME constant is used.')
    .option('-g, --ignore <ignore>', 'Ignore patterns for files which should not be part of ' +
        'the diff-deployment (i.e. unit tests, code coverage...). Comma-separated list of glob patterns')
    .option('-f, --forcedeploy <forcedeploy>', 'Patterns of files which should always be deployed, ' +
        'even if these have not been changed. The deploy will ALWAYS include these files within the deployment, ' +
        'regardless if these files were not changed or were ignored by the previous ignore patterns list.')
    .option('-a, --activate', 'Whether to activate the deployed code version, false by default')
    .option('-o, --override', 'Override the remote manifest with the new version from the instance ' +
        'in case one exists if specified')
    .option('-r, --removeafter', 'Remove the generated manifest files once completed')
    .option('-c, --certificate <certificate>','Path to the certificate to use for two factor authentication.')
    .option('-p, --passphrase <passphrase>','Passphrase to be used to read the given certificate.')
    .option('-v, --verbose', 'Verbose mode')
    .description('Generate a manifest for the given local directories. ' +
        'Compare this manifest with the one within the active code version of the instance. ' +
        'Deploy only the files which have been updated locally comparing to the remote, ' +
        'within a newly created code version.' +
        'Activate this newly generated code version if required in the options')
    .action((codeversion, localdirectorypaths, options) => {
        var instance = require('./lib/instance').getInstance(options.instance);
        require('./lib/code').cli.diffdeploy(instance, localdirectorypaths, codeversion, {
            sourceCodeVersion: options.sourcecodeversion,
            manifestFileName: options.manifestfilename,
            pfx: options.certificate,
            passphrase: options.passphrase,
            overrideLocalFile: options.override,
            removeFilesAfter: options.removeafter,
            ignorePatterns: options.ignore,
            forceDeployPatterns: options.forcedeploy,
            verbose: options.verbose
        }, options.activate || false).catch(err => {
            console.log(colors.red(err))
            process.exit(-1);
        });
    }).on('--help', () => {
        console.log();
        console.log('  Details:');
        console.log();
        console.log('  This command performs a differential deployment by following these steps:');
        console.log('  1. Get the active code version (if it does not exist or ' +
            'there is an issue while connecting, abort)');
        console.log('  2. Download the manifest file from the code version (if it does not exist, abort)');
        console.log('  3. Generate a local manifest, which represents the state of the local files ' +
            '(if there is any issue finding files, abort)');
        console.log('  4. Compare both manifests, and keep track of the changed files. ' +
            'If no files are changed, end the process');
        console.log('  5. Copy the remote code version in a new folder, named with the codeversion parameter.');
        console.log('  6. Upload files through a partial ZIP archive which contains the added and changed files, ' +
            'based on the comparison done at step#4. The new manifest is also part of this archive. ' +
            'For removed files, perform a DELETE request, one file at a time.');
        console.log('  7. Activate the newly generated code version on the instance, ' +
            'if the activate option is passed.');
        console.log('  8. Remote the manifest and archive files locally after the process '
            + 'if the removeafter option is passed.');
        console.log();
        console.log('  Examples:');
        console.log();
        console.log('    $ sfcc-ci code:diffdeploy "newcodeversion" "/path/to/repo1,/path/to/repo2"');
        console.log('    $ sfcc-ci code:diffdeploy "newcodeversion" "/path/to/repo1,/path/to/repo2" ' +
            '-i my-instance-alias');
        console.log('    $ sfcc-ci code:diffdeploy "newcodeversion" "/path/to/repo1,/path/to/repo2" ' +
            '-i my-instance.demandware.net');
        console.log('    $ sfcc-ci code:diffdeploy "newcodeversion" "/path/to/repo1,/path/to/repo2" ' +
            '-i my-instance.demandware.net -a');
        console.log('    $ sfcc-ci code:diffdeploy "newcodeversion" "/path/to/repo1,/path/to/repo2" ' +
            '-i my-instance.demandware.net -a -c path/to/my/certificate.p12 -p "myPassphraseForTheCertificate"');
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
    .command('cartridge:add <cartridgename>')
    .option('-i, --instance <instance>','Instance to add cartridge name to. Can be an instance alias. If not ' +
    'specified the currently configured instance will be used.')
    .option('-p, --position <position>','Position on where to add the cartridge in its cartrigde path.' +
    'Possible Values first|last|before|after')
    .option('-t, --target [target]','The cartridge name ' +
    'relative to the postion parameter (before|after) ')
    .option('--siteid <siteid>', 'the site the cartridge will be added to')
    .description('Adds a cartridge-name to the site cartridge path')
    .action(function(cartridgename, options) {
        var instance = require('./lib/instance').getInstance(options.instance);
        var verbose = ( options.verbose ? options.verbose : false );
        var position = ( options.position ? options.position : 'last' );
        var target = ( options.target ? options.target : '' );
        var siteid = ( options.siteid ? options.siteid : 'RefArch' );
        require('./lib/cartridge').add(instance, cartridgename, position, target, siteid, verbose);
    }).on('--help', function() {
        console.log('');
        console.log('  Details:');
        console.log('');
        console.log('  This command only assigns the cartridge name to a given site. If --siteid is omitted');
        console.log('  then RefArch is used as site id.');
        console.log();
        console.log('  The cartridge code itself must be deployed specifically using code:deploy command');
        console.log('');
        console.log('  Examples:');
        console.log('');
        console.log('    $ sfcc-ci cartridge:add plugin_applepay -p first --siteid RefArch');
        console.log('    $ sfcc-ci cartridge:add plugin_applepay -p after -t app_yourshophere --siteid YourShopHere');
        console.log('');
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
    console.log('    $SFCC_LOGIN_URL                    set login url used for authentication');
    console.log('    $SFCC_OAUTH_LOCAL_PORT             set Oauth local port for authentication flow');
    console.log('    $SFCC_OAUTH_CLIENT_ID              client id used for authentication');
    console.log('    $SFCC_OAUTH_CLIENT_SECRET          client secret used for authentication');
    console.log('    $SFCC_OAUTH_USER_NAME              user name used for authentication');
    console.log('    $SFCC_OAUTH_USER_PASSWORD          user password used for authentication');
    console.log('    $SFCC_SANDBOX_API_HOST             set sandbox API host');
    console.log('    $SFCC_SANDBOX_API_POLLING_TIMEOUT  set timeout for sandbox polling in minutes')
    console.log('    $DEBUG                             enable verbose output');
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
