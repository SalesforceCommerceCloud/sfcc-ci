# Salesforce Commerce Cloud CLI #

The Salesforce Commerce Cloud CLI is a command line interface (CLI) for Salesforce Commerce Cloud. It can be used to facilitate deployment and continuous integration practices using Salesforce B2C Commerce.

The CLI can be used from any machine either locally or from build tools, like Jenkins, Travis CI, Bitbucket Pipelines, Heroku CI etc.

In addition to the CLI a basic JavaScript API is included which can be used to integrate with higher level applications on Node.js.

# License #

As of version 2.3.0 this project is released under the BSD-3-Clause license. For full license text, see the [LICENSE](LICENSE.txt) file in the repo root or https://opensource.org/licenses/BSD-3-Clause.

# Contributing #

To contribute to this project, follow the [Contribution Guidelines](CONTRIBUTING.md). All external contributors must sign the [Contributor License Agreement (CLA)](https://cla.salesforce.com/sign-cla).

# Who do I talk to? #

Feel free to create issues and enhancement requests or discuss on the existing ones, this will help us understanding in which area the biggest need is. Please refer to documentation below before doing so.

* Maintainer: @tobiaslohr

# What is this repository for? #

The focus of the tool is to streamline and easy the communication with Commerce Cloud instances as part of the CI/CD processes. It focuses on the deployment part supporting quality checks such as test execution, not on the quality checks itself.

**Features:**

* Interactive and headless authentication against Account Manager
* Support for B2C On-Demand Developer Sandboxes
* Uses Open Commerce APIs completely
* Authentication using Oauth2
* Configuration of multiple instances incl. aliasing
* WebDAV connectivity
* Code deployment and code version management
* System job execution and monitoring (site import)
* Custom job execution and monitoring
* Add cartridges to site cartridge path
* Exploring Account Manager orgs and management of users and roles
* JavaScript API

# How do I get set up? #

## Prerequisites ##

### Configure an API key ###

Ensure you have a valid Commerce Cloud API key (client ID) set up. If you don't have a API key, you can create one using the [Account Manager](https://account.demandware.com). Management of API keys is done in _Account Manager > API Client_ and requires _Account Administrator_ or _API Administrator_ role.

For automation (e.g. a build server integration) you'll need the API key as well as the API secret for authentication. If you want to use authentication in interactive mode, you have to set _Redirect URIs_ to `http://localhost:8080`. If you want to manage sandboxes you have to set _Default Scopes_ to `roles tenantFilter profile`.

### Grant your API key access to your instances ###

In order to perform CLI commands, you have to permit API calls to the Commerce Cloud instance(s) you wish to integrate with. You do that by modifying the Open Commerce API Settings as well as the WebDAV Client Permissions on the Commerce Cloud instance.

1. Log into the Business Manager
2. Navigate to _Administration > Site Development > Open Commerce API Settings_
3. Make sure, that you select _Data API_ and _Global_ from the select boxes
4. Add the permission set for your client ID to the settings.

Use the following snippet as your client's permission set, replace `my_client_id` with your own client ID. Note, if you already have Open Commerce API Settings configured on your instance, e.g. for other API keys, you have to merge this permission set into the existing list of permission sets for the other clients.
```JSON
    {
      "_v": "19.5",
      "clients":
      [
        {
          "client_id": "my_client_id",
          "resources":
          [
            {
              "resource_id": "/code_versions",
              "methods": ["get"],
              "read_attributes": "(**)",
              "write_attributes": "(**)"
            },
            {
              "resource_id": "/code_versions/*",
              "methods": ["patch", "delete"],
              "read_attributes": "(**)",
              "write_attributes": "(**)"
            },
            {
              "resource_id": "/jobs/*/executions",
              "methods": ["post"],
              "read_attributes": "(**)",
              "write_attributes": "(**)"
            },
            {
              "resource_id": "/jobs/*/executions/*",
              "methods": ["get"],
              "read_attributes": "(**)",
              "write_attributes": "(**)"
            },
            { 
              "resource_id": "/sites/*/cartridges", 
              "methods": ["post"], 
              "read_attributes": "(**)", 
              "write_attributes": "(**)"
            },
            {
              "resource_id":"/role_search",
              "methods":["post"],
              "read_attributes":"(**)",
              "write_attributes":"(**)"
            },
            {
              "resource_id":"/roles/*",
              "methods":["get"],
              "read_attributes":"(**)",
              "write_attributes":"(**)"
            },
            {
              "resource_id":"/roles/*/user_search",
              "methods":["post"],
              "read_attributes":"(**)",
              "write_attributes":"(**)"
            },
            {
              "resource_id":"/roles/*/users/*",
              "methods":["put","delete"],
              "read_attributes":"(**)",
              "write_attributes":"(**)"
            },
            {
              "resource_id":"/user_search",
              "methods":["post"],
              "read_attributes":"(**)",
              "write_attributes":"(**)"
            },
            {
              "resource_id":"/users",
              "methods":["get"],
              "read_attributes":"(**)",
              "write_attributes":"(**)"
            },
            {
              "resource_id":"/users/*",
              "methods":["put","get","patch","delete"],
              "read_attributes":"(**)",
              "write_attributes":"(**)"
            }
          ]
        }
      ]
    }
```

5. Navigate to _Administration > Organization > WebDAV Client Permissions_
6. Add the permission set for your client ID to the permission settings.

Use the following snippet as your client's permission set, replace `my_client_id` with your client ID. Note, if you already have WebDAV Client Permissions configured, e.g. for other API keys, you have to merge this permission set into the existing list of permission sets for the other clients.
```JSON
    {
      "clients":
      [
        {
          "client_id": "my_client_id",
          "permissions":
          [
            {
              "path": "/impex",
              "operations": [
                "read_write"
              ]
            },
            {
              "path": "/cartridges",
              "operations": [
                "read_write"
              ]
            },
            {
              "path": "/static",
              "operations": [
                "read_write"
              ]
            },
            {
              "path": "/catalogs/<your-catalog-id>",
              "operations": [
                "read_write"
              ]
            },
            {
              "path": "/libraries/<your-library-id>",
              "operations": [
                "read_write"
              ]
            },
            {
              "path": "/dynamic/<your-site-id>",
              "operations": [
                "read_write"
              ]
            }
          ]
        }
      ]
    }
```

## Dependencies ##

If you plan to integrate with the JavaScript API or if you want to download the sources and use the CLI through Node you need Node.js and npm to be installed. No other dependencies.

Please check [this guide](https://docs.npmjs.com/files/package.json#git-urls-as-dependencies) on how to define dependency to the right version using a GIT url.

If do not want to use the JavaScript API, but just the CLI you don't need Node.js and npm necessarily. See "Installation Instructions" for details below.

## Installation Instructions ##

You can install the CLI using a pre-built binary or from source using Node.js.

### Install Prebuilt Binary ###

If you are using the CLI but don't want to mess around with Node.js you can simply download the latest binaries for your OS at [Releases](https://github.com/SalesforceCommerceCloud/sfcc-ci/releases/latest). The assets with each release contain binaries for MacOS, Linux and Windows.

#### MacOS ####

1. Download the binary for MacOS.

2. Make the binary executable:

        chmod +x ./sfcc-ci-macos

3. Move the binary in to your PATH:

        sudo mv ./sfcc-ci-macos /usr/local/bin/sfcc-ci

### Linux ###

1. Download the binary for Linux.

2. Make the binary executable:

        chmod +x ./sfcc-ci-linux

3. Move the binary in to your PATH:

        sudo mv ./sfcc-ci-linux /usr/local/bin/sfcc-ci

### Windows ###

1. Download the binary for Windows.

2. Add the binary in to your PATH:

        set PATH=%PATH%;C:\path\to\binary

You are now ready to use the tool by running the main command `sfcc-ci`.

### Building from Source using Node.js ###

* Make sure Node.js and npm are installed.
* Clone or download the sources.
* * If you choose to clone, it best done through ssh along with an ssh key which you have to create with your Github account.
* * If you choose to download the latest sources, you can do so from [Releases](https://github.com/SalesforceCommerceCloud/sfcc-ci/releases/latest), after which you have to unzip the archive.
* `cd` into the directory and run `npm install`. You may choose to install globally, by running `npm install -g` instead.
* Check if installation was successful by running `sfcc-ci --help`. In case you encouter any issues with running `sfcc-ci`, you may run `npm link` to create a symbolic link explicitly. The symbolic link enables you to run `sfcc-ci` from any location on your machine.

# Using the Command Line Interface #

## Commands ##

Use `sfcc-ci --help` or just `sfcc-ci` to get started and see the full list of commands available:

```bash
    Usage: cli [options] [command]

  Options:
    -V, --version                                                   output the version number
    -D, --debug                                                     enable verbose output
    --selfsigned                                                    allow connection to hosts using self-signed certificates
    -I, --ignorewarnings                                            ignore any warnings logged to the console
    -h, --help                                                      output usage information
    -j, --json                                                      print output as JSON instead of plain text

  Commands:
    auth:login [options] [client] [secret]                          Authenticate a present user for interactive use
    auth:logout                                                     End the current sessions and clears the authentication
    client:auth [options] [client] [secret] [user] [user_password]  Authenticate an API client with an optional user for automation use
    client:auth:renew                                               Renews the client authentication. Requires the initial client authentication to be run with the --renew option.
    client:auth:token                                               Return the current authentication token
    data:upload [options]                                           Uploads a file onto a Commerce Cloud instance
    sandbox:realm:list [options]                                    List realms eligible to manage sandboxes for
    sandbox:realm:update [options]                                  Update realm settings
    sandbox:list [options]                                          List all available sandboxes
    sandbox:ips [options]                                           List inbound and outbound IP addresses for sandboxes
    sandbox:create [options]                                        Create a new sandbox
    sandbox:get [options]                                           Get detailed information about a sandbox
    sandbox:update [options]                                        Update a sandbox
    sandbox:start [options]                                         Start a sandbox
    sandbox:stop [options]                                          Stop a sandbox
    sandbox:restart [options]                                       Restart a sandbox
    sandbox:reset [options]                                         Reset a sandbox
    sandbox:delete [options]                                        Delete a sandbox
    sandbox:alias:add [options]                                     Registers a hostname alias for a sandbox.
    sandbox:alias:list [options]                                    Lists all hostname aliases, which are registered for the given sandbox.
    sandbox:alias:delete [options]                                  Removes a sandbox alias by its ID
    instance:add [options] <instance> [alias]                       Adds a new Commerce Cloud instance to the list of configured instances
    instance:set <alias_or_host>                                    Sets a Commerce Cloud instance as the default instance
    instance:clear                                                  Clears all configured Commerce Cloud instances
    instance:list [options]                                         List instance and client details currently configured
    instance:upload [options] <archive>                             Uploads an instance import file onto a Commerce Cloud instance
    instance:import [options] <archive>                             Perform a instance import (aka site import) on a Commerce Cloud instance
    instance:export [options]                                       Run an instance export
    code:list [options]                                             List all custom code versions deployed on the Commerce Cloud instance
    code:deploy [options] <archive>                                 Deploys a custom code archive onto a Commerce Cloud instance
    code:activate [options] <version>                               Activate the custom code version on a Commerce Cloud instance
    code:delete [options]                                           Delete a custom code version
    code:manifest:generate <localdirectorypaths>                    Generates the manifest file based on the given local directories
    code:compare <localdirectorypaths>                              Compares the given local directories with the given code version (or the active one if none specified) of the Commerce Cloud instance and provide a diff between the two
    code:deploy:diff <codeversion> <localdirectorypaths>            Deploys only the local changes to the instance and not a full new code version
    job:run [options] <job_id> [job_parameters...]                  Starts a job execution on a Commerce Cloud instance
    job:status [options] <job_id> <job_execution_id>                Get the status of a job execution on a Commerce Cloud instance
    cartridge:add [options] <cartridgename>                         Adds a cartridge-name to the site cartridge path
    org:list [options]                                              List all orgs eligible to manage
    role:list [options]                                             List roles
    role:grant [options]                                            Grant a role to a user
    role:revoke [options]                                           Revoke a role from a user
    user:list [options]                                             List users eligible to manage
    user:create [options]                                           Create a new user
    user:update [options]                                           Update a user
    user:delete [options]                                           Delete a user

  Environment:

    $SFCC_LOGIN_URL                    set login url used for authentication
    $SFCC_OAUTH_LOCAL_PORT             set Oauth local port for authentication flow
    $SFCC_OAUTH_CLIENT_ID              client id used for authentication
    $SFCC_OAUTH_CLIENT_SECRET          client secret used for authentication
    $SFCC_OAUTH_USER_NAME              user name used for authentication
    $SFCC_OAUTH_USER_PASSWORD          user password used for authentication
    $SFCC_SANDBOX_API_HOST             set sandbox API host
    $SFCC_SANDBOX_API_POLLING_TIMEOUT  set timeout for sandbox polling in minutes
    $DEBUG                             enable verbose output

  Detailed Help:

    Use sfcc-ci <sub:command> --help to get detailed help and example usage of sub:commands

  Useful Resources:

    Salesforce Commerce Cloud CLI Release Notes: https://sfdc.co/sfcc-cli-releasenotes
    Salesforce Commerce Cloud CLI Readme: https://sfdc.co/sfcc-cli-readme
    Salesforce Commerce Cloud CLI Cheatsheet: https://sfdc.co/sfcc-cli-cheatsheet
    Salesforce Commerce Cloud Account Manager: https://account.demandware.com
    Salesforce Commerce Cloud API Explorer: https://api-explorer.commercecloud.salesforce.com
    Salesforce Commerce Cloud Documentation: https://documentation.b2c.commercecloud.salesforce.com
```

Use `sfcc-ci <sub:command> --help` to get detailed help and example usage of a sub:command.

## Configuration ##

The CLI keeps it's own settings. The location of these settings are OS specific. On Linux they are located at `$HOME/.config/sfcc-ci-nodejs/`, on MacOS they are located at `$HOME/Library/Preferences/sfcc-ci-nodejs/`.

In addition the CLI can be configured by placing a `dw.json` file into the current working directory. The `dw.json` may carry details used run authentication.

```json
{
    "client-id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "client-secret": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "username": "user",
    "password": "password",
    "hostname": "<dev-sandbox>.demandware.net"
}
```

## Environment Variables ##

The use of environment variables is optional. `sfcc-ci` respects the following environment variables which you can use to control, how the CLI works:

* `SFCC_LOGIN_URL` set login url used for authentication
* `SFCC_OAUTH_LOCAL_PORT` set Oauth local port for authentication flow
* `SFCC_OAUTH_CLIENT_ID` client id used for authentication
* `SFCC_OAUTH_CLIENT_SECRET` client secret used for authentication
* `SFCC_OAUTH_USER_NAME` user name used for authentication
* `SFCC_OAUTH_USER_PASSWORD` user password used for authentication
* `SFCC_SANDBOX_API_HOST` set sandbox API host
* `SFCC_SANDBOX_API_POLLING_TIMEOUT` set timeout for sandbox polling in minutes
* `DEBUG` enable verbose output

If you only want a single CLI command to write debug messages prepend the command using, e.g. `DEBUG=* sfcc-ci <sub:command>`.

## Parameter Precedence ##

The parameters are used with the following precedence:

1. Passing explicit params to the commandline (e.g `sfcc-ci client:auth client_id client_secret`)
2. Credentials in a `dw.json`
3. Creating an `.env` file 
4. Setting `env vars` on your  machine

## Authentication ##

### Oauth Credentials and Secrets ###

Depending on how you use `sfcc-ci` you make use of command `sfcc-ci auth:login` or `sfcc-ci client:auth` to authenticate. These commands accept credentials being explicitly passed as arguments to these commands. Use `sfcc-ci auth:login --help` and `sfcc-ci client:auth --help` for more info. However, there are alternative ways on how to make credentials available to the CLI for authentication:

* You can define credentials in a `dw.json` file. The CLI will attempt to read this file (if present) from the current working directory.
* Alternatively you can use a set of well-known env vars (if set) which the CLI will use. Namely, these are `SFCC_OAUTH_CLIENT_ID` (client id), `SFCC_OAUTH_CLIENT_SECRET` (client secret), `SFCC_OAUTH_USER_NAME` (user name) and `SFCC_OAUTH_USER_PASSWORD` (user password). 
```bash
export SFCC_OAUTH_CLIENT_ID=<client-id>
export SFCC_OAUTH_CLIENT_SECRET=<client-secret>
export SFCC_OAUTH_USER_NAME=<user-name>
export SFCC_OAUTH_USER_PASSWORD=<user-password>
```
* Lastly you can make use of a `.env` file, which holds the credentials in form of `NAME=VALUE` using the same set of well-known env vars as above. The CLI will attempt to make use of the env vars in this file (if present) from the current working directory. For example:
```bash
SFCC_OAUTH_CLIENT_ID=<client-id>
SFCC_OAUTH_CLIENT_SECRET=<client-secret>
SFCC_OAUTH_USER_NAME=<user-name>
SFCC_OAUTH_USER_PASSWORD=<user-password>
```

### Authorization Server ###

`sfcc-ci` uses a default authorization server. You can overwrite this authorization server and use an alternative login url using the env var `SFCC_LOGIN_URL`:

```bash
export SFCC_LOGIN_URL=<alternative-authorization-server>
```

Removing the env var (`unset SFCC_LOGIN_URL`) will make the CLI use the default authorization server again.

### Oauth Local Port ###

`sfcc-ci` uses a default Oauth local port for authentication flow via command `sfcc-ci auth:login`. You can overwrite this port and use an alternative port number (e.g. if the default port is used on your machine and you cannot use is) using the env var `SFCC_OAUTH_LOCAL_PORT`:

```bash
export SFCC_OAUTH_LOCAL_PORT=<alternative-port>
```

Removing the env var (`unset SFCC_OAUTH_LOCAL_PORT`) will make the CLI use the default port again.

## Authorization ##

Depending on which activities you want to want to perform, you have to ensure proper permissions have been granted beforehand. The required permissions and where to grant them to depend on the command and whether you want to execute commands interactively (user present) or implement automations (no user present).

Consult the table below to set permissions depending on the activity desired:

Commands | Interactive Use | Automation Use
------------ | ------------ | -------------
data:* | OCAPI Data API Settings | OCAPI Data API Settings
sandbox:* | Sandbox API User role assigned to user | Sandbox API User role assigned to API client
instance:* | OCAPI Data API Settings | OCAPI Data API Settings
code:* | OCAPI Data API Settings | OCAPI Data API Settings
job:* | OCAPI Data API Settings | OCAPI Data API Settings
cartridge:* | OCAPI Data API Settings | OCAPI Data API Settings
org:* | Account Administrator role assigned to user | Account Administrator role assigned to API client
role:* | Account Administrator role assigned to user _or_ OCAPI Data API Settings | Account Administrator role assigned to API client _or_ OCAPI Data API Settings 
users:* | Account Administrator role assigned to user _or_ OCAPI Data API Settings | Account Administrator role assigned to API client _or_ OCAPI Data API Settings 

## Sandbox API ##

### API Server ###

`sfcc-ci` uses a default host for the sandbox API. You can overwrite this host and use an alternative host using the env var `SFCC_SANDBOX_API_HOST`:

```bash
export SFCC_SANDBOX_API_HOST=<alternative-sandbox-api-host>
```

Removing the env var (`unset SFCC_SANDBOX_API_HOST`) will make the CLI use the default host again.

### API Polling Timeout ###

`sfcc-ci` allows the creation of a sandbox in sync mode (see `sfcc-ci sandbox:create --help` for details). By default the polling of the sandbox status lasts for 10 minutes at maximum until the timeout is reached. You can overwrite this timeout and specify another timeout in minutes using the env var `SFCC_SANDBOX_API_POLLING_TIMEOUT`:

```bash
export SFCC_SANDBOX_API_POLLING_TIMEOUT=<alternative-sandbox-api-polling-timeout-in-minutes>
```

Removing the env var (`unset SFCC_SANDBOX_API_POLLING_TIMEOUT`) will make the CLI use the default timeout again.

## Debugging ##

You can force `sfcc-ci` to write debug messages to the console using the env var `DEBUG`. You can do this for globally by setting the env var, so that any following CLI command will write debug messages:

```bash
export DEBUG=*
```

If you only want a single CLI command to write debug messages use the the `-D,--debug` flag with any command, e.g. `sfcc-ci <sub:command> --debug`.

## Sorting list ##

To output objects to a sorted list, add the `-S,--sortby` option to one of the supported commands. Sort objects by specifying any field.

## CLI Examples ##

The examples below assume you have defined a set of environment variables:

* an API Key (the client ID)
* an API Secret (the client secret)
* your Account Manager User Name
* your Account Manager User Password

On Linux and MacOS you can set environment variables as follows:

```bash
export API_KEY=<my-api-key>
export API_SECRET=<my-api-secret>
export API_USER=<my-user>
export API_USER_PW=<my-user-pw>
```

On Windows you set them as follows:

```bash
set API_KEY=<my-api-key>
set API_SECRET=<my-api-secret>
set API_USER=<my-user>
set API_USER_PW=<my-user-pw>
```

The remainder of the examples below assume you are on Linux or MacOS. If you are on Windows you access environment variables using `%MY_ENV_VAR%` instead of `$MY_ENV_VAR`.

Note: Some CLI commands provide structured output of the operation result as JSON. To process this JSON a tool called `jq` comes in handy. Installation and documentation of `jq` is located at https://stedolan.github.io/jq/manual/. 

### Authentication ###

In an interactive mode you usually authenticate as follows:

```bash
sfcc-ci auth:login $API_KEY
```

In an automation scenario (where no user is present) authentication is done as follows:

```bash
sfcc-ci client:auth $API_KEY $API_SECRET
```

In an automation scenario where you want to manage sandboxes you still need a service user (with role Sandbox API User assigned). In this case authentication is done as follows:

```bash
sfcc-ci client:auth $API_KEY $API_SECRET
```

Note, that the service user must not be doing MFA. You may accomplish this by only assigning role Sandbox API User and deactivating MFA for only exactly this role.

Logging out (and removing any traces of secrets from the machine):

```bash
sfcc-ci auth:logout
```

### Pushing Code ###

Pushing code to any SFCC instance and activate it:

```bash
sfcc-ci code:deploy <path/to/code_version.zip> -i your-instance.demandware.net
sfcc-ci code:activate <code_version> -i your-instance.demandware.net
```

### Data Import ###

Running an instance import (aka site import) on any SFCC instance:

```bash
sfcc-ci instance:upload <path/to/data.zip> -i your-instance.demandware.net
sfcc-ci instance:import <data.zip> -i your-instance.demandware.net -s
```

Running the instance import without waiting for the import to finish you omit the `--sync,-c` flag:

```bash
sfcc-ci instance:import <data.zip> -i your-instance.demandware.net
```

### Sandboxes ###

Provision a new sandbox, outputting the inbound and outbound IP addresses, uploading code and running an instance import:

```bash
SANDBOX=`sfcc-ci sandbox:create <a-realm> -s -j`
SANDBOX_HOST=`$SANDBOX | jq '.instance.host' -r`
sfcc-ci sandbox:ips
sfcc-ci code:deploy <path/to/code.zip> -i $SANDBOX_HOST
sfcc-ci instance:upload <path/to/data.zip> -i $SANDBOX_HOST -s
sfcc-ci instance:import <data.zip> -i your-instance.demandware.net
```
### Cartridges ###
Handles the cartridge path of your Site. Very useful for plugin installation.
You can put the cartridge on top or at the bottom of the cartridge path. Or if given an anchor cartridge at the before or after a cartridge.

```bash
sfcc-ci cartridge:add <cartridgename> -p [first|last] -S <siteid>
sfcc-ci cartridge:add <cartridgename> -p [before|after] -t [targetcartidge] -S <siteid>
```

# Using the JavaScript API #

There is a JavaScript API available, which you can use to program against and integrate the commands into your own project.

Make sfcc-ci available to your project by specifying the dependeny in your `package.json` first and running and `npm install` in your package. After that you require the API into your implementation using:

```javascript
  const sfcc = require('sfcc-ci');
```

The API is structured into sub modules. You may require sub modules directly, e.g.

```javascript
  const sfcc_auth = require('sfcc-ci').auth;
  const sfcc_cartridge = require('sfcc-ci').cartridge;
  const sfcc_code = require('sfcc-ci').code;
  const sfcc_instance = require('sfcc-ci').instance;
  const sfcc_job = require('sfcc-ci').job;
  const sfcc_user = require('sfcc-ci').user;
  const sfcc_webdav = require('sfcc-ci').webdav;
```

The following APIs are available (assuming `sfcc` refers to `require('sfcc-ci')`):

```javascript
  sfcc.auth.auth(client_id, client_secret, callback);
  sfcc.cartridge.add(instance, cartridgename, position, target, siteid, verbose, token, callback);
  sfcc.code.activate(instance, code_version, token, callback);
  sfcc.code.deploy(instance, archive, token, options, callback);
  sfcc.code.list(instance, token, callback);
  sfcc.code.compare(instance, localDirectories, options);
  sfcc.code.diffdeploy(instance, localDirectories, codeVersionName, options, activate);
  sfcc.instance.upload(instance, file, token, options, callback);
  sfcc.instance.import(instance, file_name, token, callback);
  sfcc.job.run(instance, job_id, job_params, token, callback);
  sfcc.job.status(instance, job_id, job_execution_id, token, callback);
  sfcc.manifest.generate(directories, ignorePatterns, targetDirectory, fileName);
  sfcc.user.create(org, user, mail, firstName, lastName, token).then(result => ...).catch(err => ...);
  sfcc.user.list(org, role, login, count, sortBy, token).then(result => ...).catch(err => ...);
  sfcc.user.update(login, changes, token).then(result => ...).catch(err => ...);
  sfcc.user.grant(login, role, scope, token).then(result => ...).catch(err => ...);
  sfcc.user.revoke(login, role, scope, token).then(result => ...).catch(err => ...);
  sfcc.user.delete(login, purge, token).then(result => ...).catch(err => ...);
  sfcc.user.createLocal(instance, login, user, token).then(result => ...).catch(err => ...);
  sfcc.user.searchLocal(instance, login, query, role, sortBy, count, start, token).then(result => ...).catch(err => ...);
  sfcc.user.updateLocal(instance, login, changes, token).then(result => ...).catch(err => ...);
  sfcc.user.grantLocal(instance, login, role, token).then(result => ...).catch(err => ...);
  sfcc.user.revokeLocal(instance, login, role, token).then(result => ...).catch(err => ...);
  sfcc.user.deleteLocal(instance, login, token).then(result => ...).catch(err => ...);
  sfcc.webdav.upload(instance, path, file, token, options, callback);
```

### Authentication ###

APIs available in `require('sfcc-ci').auth`:

`auth(client_id, client_secret, callback)`

Authenticates a clients and attempts to obtain a new Oauth2 token. Note, that tokens should be reused for subsequent operations. In case of a invalid token you may call this method again to obtain a new token.

Param         | Type        | Description
------------- | ------------| --------------------------------
client_id     | (String)    | The client ID
client_secret | (String)    | The client secret
callback      | (Function)  | Callback function executed as a result. The error and the token will be passed as parameters to the callback function.

**Returns:** (void) Function has no return value

Example:

```javascript
const sfcc = require('sfcc-ci');

var client_id = 'my_client_id';
var client_secret = 'my_client_id';

sfcc.auth.auth(client_id, client_secret, function(err, token) {
    if(token) {
        console.log('Authentication succeeded. Token is %s', token);
    }
    if(err) {
        console.error('Authentication error: %s', err);
    }
});

```

### Cartridge ###

APIs available in `require('sfcc-ci').cartridge`:

`add(instance, cartridgename, position, target, siteid, verbose, token, callback)`

Allows to add a cartridge to the cartridge path for a given site at a specific position.

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to add the cartridge.
cartridgename | (String)    | The given cartride name.
position      | (String)    | Either first, last, before or after.
target        | (String)    | When position is 'before' or 'after', need to specify the target cartridge.
siteid        | (String)    | ID of the site, where the cartrdige should be added.
token         | (String)    | The Oauth token to use for authentication.
verbose       | (Boolean)   | Wether or not to use logging capabilities.
callback      | (Function)  | Callback function executed as a result. The error and the token will be passed as parameters to the callback function.

**Returns:** (void) Function has no return value

Example:

```javascript
const sfcc = require('sfcc-ci');

var instance = '"*.sandbox.us01.dx.commercecloud.salesforce.com';
var cartridgename = 'app_custom';
var position = 'before';
var target = 'app_storefront_base';
var siteid = 'RefArch';
var verbose = false;
var token = 1234;

sfcc.cartridge.add(instance, cartridgename, position, target, siteid, verbose, token, function(err, token) {
  // ...
});

```

***

### Code ###

APIs available in `require('sfcc-ci').code`:

`deploy(instance, archive, token, options, callback)`

Deploys a custom code archive onto a Commerce Cloud instance

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to activate the code on
archive       | (String)    | The ZIP archive filename to deploy
token         | (String)    | The Oauth token to use use for authentication
options       | (Object)    | The options parameter can contains two properties: pfx: the path to the client certificate to use for two factor authentication. passphrase: the optional passphrase to use with the client certificate
callback      | (Function)  | Callback function executed as a result. The error will be passed as parameter to the callback function.

**Returns:** (void) Function has no return value

***

`list(instance, token, callback)`

Get all custom code versions deployed on a Commerce Cloud instance.

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to activate the code on
token         | (String)    | The Oauth token to use for authentication
callback      | (Function)  | Callback function executed as a result. The error and the code versions will be passed as parameters to the callback function.

**Returns:** (void) Function has no return value

***

`activate(instance, code_version, token, callback)`

Activate the custom code version on a Commerce Cloud instance. If the code version is already active, no error is available.

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to activate the code on
code_version  | (String)    | The code version to activate
token         | (String)    | The Oauth token to use use for authentication
callback      | (Function)  | Callback function executed as a result. The error will be passed as parameter to the callback function.

**Returns:** (void) Function has no return value

***

`compare(instance, localDirectories, options)`

Compare the given local directories with the given code version (or the active one if none specified) of the Commerce Cloud instance and provide a diff between the two

Param                     | Type        | Description
------------------------- | ------------| --------------------------------
instance                  | (String)    | The instance to activate the code on
localDirectories          | (Array)     | The list of local directories to compare with the remote instance
options                   | (Object)    | The object that contain all the possible options.
options.sourceCodeVersion | (String)    | This is the name of the code version from the instance to use as source of comparison. If not specified, the active code version is used.
options.manifestFileName  | (String)    | The name of the remote manifest file. If not provided, the `manifest.FILENAME` constant is used.
options.pfx               | (String)    | The path to the certificate to authenticate to the instance.
options.passphrase        | (String)    | The passphrase associated with the given certificate.
options.overrideLocalFile | (Boolean)   | If not provided, the process won't override any existing manifest previously downloaded, and will abort the process. If provided, then any existing downloaded manifest file will be overridden
options.ignorePatterns    | (Array)     | A list of [glob](https://www.npmjs.com/package/glob) patterns to use to ignore files while listing local files and generating the local manifest. If not provided, the default patterns are used: `['test/**/*', 'coverage/**/*', 'documentation/**/*', 'docs/**/*', '*.md']`
options.outputFile        | (Boolean)   | If provided, a file will be generated with the resuts in the comparison in the `process.cwd()` folder. Its path is then passed in the `resolve` method of the returned promise. If not provided, then the comparison results are passed in the `resolve` method of the returned promise.
options.removeFilesAfter  | (Boolean)   | If provided, the downloaded manifest and generated one (for local files) are removed. Only the output file will remain (if the option `outputFile` is provided). If not provided, any manifest used for the comparison will remain in the `process.cwd()` folder.
options.verbose           | (Object)    | Asks the process to log each stage of the comparison task.

**Returns:** (Promise) Returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
The `resolve` method is called with either:
- The path of the output file which contain the comparison results, if the `outputFile` option is passed
- The JSON representation of the comparison results, if the `outputFile` option is **not** passed
The `reject` method is called with any error message if an error occurs during the comparison process

Example:

```javascript
const sfcc = require('sfcc-ci');

const instance = '"*.sandbox.us01.dx.commercecloud.salesforce.com';
const localDirectories = ['path/to/repo1', 'path/to/repo2'];
const options = {
    ignorePatterns: ['test/**/*', 'docs/**/*'],
    outputFile: true,
    removeFilesAfter: true,
    overrideLocalFile: true
};

sfcc.code.compare(instance, localDirectories, options)
    .then(deltaResult => {
        // do something with the delta result, which contains the difference between the local directories and the remote code version
    })
    .catch(err => console.log(err));

```

***

`diffdeploy(instance, localDirectories, codeVersionName, options, activate)`

Generate a manifest for the given local directories. Compare this manifest with the one within the active code version of the instance. Deploy only the files which have been updated locally comparing to the remote, within a newly created code version. Activate this newly generated code version if required in the options

Param                       | Type        | Description
--------------------------- | ------------| --------------------------------
instance                    | (String)    | The instance to activate the code on
localDirectories            | (Array)     | The list of local directories to compare with the remote instance
codeVersionName             | (String)    | The name of the new code version to use for the newly deployed code version
options                     | (Object)    | The object that contain all the possible options.
options.sourceCodeVersion   | (String)    | This is the name of the code version from the instance to use as source of comparison. If not specified, the active code version is used.
options.manifestFileName    | (String)    | The name of the remote manifest file. If not provided, the `manifest.FILENAME` constant is used.
options.pfx                 | (String)    | The path to the certificate to authenticate to the instance.
options.passphrase          | (String)    | The passphrase associated with the given certificate.
options.overrideLocalFile   | (Boolean)   | If not provided, the process won't override any existing manifest previously downloaded, and will abort the process. If provided, then any existing downloaded manifest file will be overridden
options.ignorePatterns      | (Array )    | A list of [glob](https://www.npmjs.com/package/glob) patterns to use to ignore files while listing local files and generating the local manifest. If not provided, the default patterns are used: `['test/**/*', 'coverage/**/*', 'documentation/**/*', 'docs/**/*', '*.md']`
options.forceDeployPatterns | (Array )    | A list of [glob](https://www.npmjs.com/package/glob) patterns to use to force the deployment for those files. The deploy will **ALWAYS** include these files within the deployment, regardless if these files were not changed or were ignored by the previous ignore patterns list.
options.removeFilesAfter    | (Boolean)   | If provided, the downloaded manifest and generated one (for local files) are removed. Only the output file will remain (if the option `outputFile` is provided). If not provided, any manifest used for the comparison will remain in the `process.cwd()` folder.
options.verbose             | (Object)    | Asks the process to log each stage of the comparison task.
activate                    | (Boolean)   | Asks the process to activate the newly deployed code version. If not provided, then the code version will remain on the instance deactivated.

**Returns:** (Promise) Returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
The `resolve` method is called with `undefined` as parameter, meaning that the process finished successfully
The `reject` method is called with any error message if an error occurs during the comparison process

Example:

```javascript
const sfcc = require('sfcc-ci');

const instance = '"*.sandbox.us01.dx.commercecloud.salesforce.com';
const localDirectories = ['path/to/repo1', 'path/to/repo2'];
const codeVersionName = 'new_code_version';
const activate = true;
const options = {
    sourceCodeVersion: 'code_version_to_use_as_source',
    ignorePatterns: ['test/**/*', 'docs/**/*'],
    forceDeployPatterns: ['**/config/**/*'],
    outputFile: true,
    removeFilesAfter: true,
    overrideLocalFile: true
};

sfcc.code.diffdeploy(instance, localDirectories, codeVersionName, options, activate)
    .then(() => {
        // do something, now that the code has been deployed and activated successfully
    })
    .catch(err => console.log(err));

```

***

### Instance ###

APIs available in `require('sfcc').instance`:

`upload(instance, file, token, options, callback)`

Uploads an instance import file onto a Commerce Cloud instance.

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to upload the import file to
file          | (String)    | The file to upload
token         | (String)    | The Oauth token to use use for authentication
options       | (Object)    | The options parameter can contains two properties: pfx: the path to the client certificate to use for two factor authentication. passphrase: the optional passphrase to use with the client certificate
callback      | (Function)  | Callback function executed as a result. The error will be passed as parameter to the callback function.

**Returns:** (void) Function has no return value

***

`import(instance, file_name, token, callback)`

Perform an instance import (aka site import) on a Commerce Cloud instance. You may use the API job.status to get the execution status of the import.

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | Instance to start the import on
file_name     | (String)    | The import file to run the import with
token         | (String)    | The Oauth token to use use for authentication
callback      | (Function)  | Callback function executed as a result. The error and the job execution details will be passed as parameters to the callback function.

**Returns:** (void) Function has no return value

***

### Jobs ###

APIs available in `require('sfcc').job`:

`run(instance, job_id, job_params, token, callback)`

Starts a job execution on a Commerce Cloud instance. The job is triggered and the result of the attempt to start the job is returned. You may use the API job.status to get the current job execution status.

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | Instance to start the job on
job_id        | (String)    | The job to start
token         | (String)    | The Oauth token to use use for authentication
job_params    | (Array)     | Array containing job parameters. A job parameter must be denoted by an object holding a key and a value property.
callback      | (Function)  | Callback function executed as a result. The error and the job execution details will be passed as parameters to the callback function.

**Returns:** (void) Function has no return value

***

`status(instance, job_id, job_execution_id, token, callback)`

Get the status of a job execution on a Commerce Cloud instance.

Param            | Type        | Description
---------------- | ------------| --------------------------------
instance         | (String)    | Instance the job was executed on.
job_id           | (String)    | The job to get the execution status for
job_execution_id | (String)    | The job execution id to get the status for
token            | (String)    | The Oauth token to use use for authentication
callback         | (Function)  | Callback function executed as a result. The error and the job execution details will be passed as parameters to the callback function.

**Returns:** (void) Function has no return value

***

### User ###

APIs available in `require('sfcc').user`:

`create(org, user, mail, firstName, lastName, token)`

Creates a new user into Account Manager

Param         | Type        | Description
------------- | ------------| --------------------------------
org           | (String)    | The org ID where to create the user
user          | (Object)    | The user object with all the required data in it
mail          | (String)    | The email of the user
firstName     | (String)    | The firstname of the user
lastName      | (String)    | The lastname of the user
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the newly created user object.

***

`list(org, role, login, count, sortBy, token)`

Lists all users eligible to manage from the Account Manager, based on the given filters (if any provided)

Param         | Type        | Description
------------- | ------------| --------------------------------
org           | (String)    | The org ID or null, if all users should be retrieved
role          | (String)    | The role or null, if all users should be retrieved
login         | (String)    | The login or null, if all users should be retrieved
count         | (Number)    | The max count of list items
sortBy        | (String)    | (Optional) field to sort the list of users by
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the results array.

***

`update(login, changes, token)`

Update a user into Account Manager

Param         | Type        | Description
------------- | ------------| --------------------------------
login         | (String)    | The login of the user to update
changes       | (Object)    | The changes to the user details
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the updated user.

***

`grant(login, role, scope, token)`

Grant a role to a user into Account Manager

Param         | Type        | Description
------------- | ------------| --------------------------------
login         | (String)    | The login (email) of the user
role          | (String)    | The role to grant
scope         | (String)    | The scope of the role to revoke
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the changed user.

***

`revoke(login, role, scope, token)`

Revoke a role to a user from Account Manager

Param         | Type        | Description
------------- | ------------| --------------------------------
login         | (String)    | The login (email) of the user
role          | (String)    | The role to grant
scope         | (String)    | The scope of the role to revoke
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the changed user.

***

`delete(login, purge, token)`

Delete a user from Account Manager

Param         | Type        | Description
------------- | ------------| --------------------------------
login         | (String)    | The user to delete
purge         | (Boolean)   | Whether to purge the user completely
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is a boolean value that confirms if the user has been deleted or not.

***

`createLocal(instance, login, user, token)`

Creates a new local user on an instance

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to create the user on
login         | (String)    | The user to delete
user          | (Object)    | The user details
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the created user.

***

`searchLocal(instance, login, query, role, sortBy, count, start, token)`

Search for local users on an instance

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to create the user on
login         | (String)    | The login or null, if all users should be retrieved
query         | (String)    | The query to search users for
role          | (String)    | The role to search users for
sortBy        | (String)    | (Optional) field to sort users by
count         | (Number)    | (Optional) number of items per page
start         | (Number)    | (Optional) zero-based index of the first search hit to include
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the results of the search.

***

`updateLocal(instance, login, changes, token)`

Update a local user on an instance

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to update the user on
login         | (String)    | The login of the local user to update
changes       | (Object)    | The changes to the user details
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the updated user.

***

`grantLocal(instance, login, role, token)`

Grant a role to a local user on an instance

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to apply the role on the user on
login         | (String)    | The login of the local user to grant
role          | (String)    | The role to grant
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the changed user.

***

`revokeLocal(instance, login, role, token)`

Revoke a role from a local user on an instance

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to apply the role on the user on
login         | (String)    | The login of the local user to revoke
role          | (String)    | The role to revoke
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is the changed user.

***

`deleteLocal(instance, login, token)`

Delete a local user from an instance

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to delete the user on
login         | (String)    | The login of the local user to delete
token         | (String)    | The Oauth token to use use for authentication

**Returns:** (Promise) The [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with its `resolve` or `reject` methods called respectively with the `result` or the `error`. The `result` variable here is a boolean value that confirms if the user has been deleted or not.

***

### Manifest ###

APIs available in `require('sfcc-ci').manifest`:

`generate(directories, ignorePatterns, targetDirectory, fileName)`

Generates the manifest file based on the given local directories.

Param                      | Type        | Description
-------------------------- | ------------| --------------------------------
directories                | (Array)     | The list of directories for which to generate a manifest. These directories has to contain a `cartridges` folder at their root level
ignorePatterns (Optional)  | (String)    | A list of [glob](https://www.npmjs.com/package/glob) patterns to use to ignore files while listing local files and generating the local manifest. If not provided, the default patterns are used: `['test/**/*', 'coverage/**/*', 'documentation/**/*', 'docs/**/*', '*.md']`
targetDirectory (Optional) | (Boolean)   | The directory where to store the generated manifest. If not provided, `process.cwd()` is used.
fileName (Optional)        | (Boolean)   | The file name to use while generating the manifest file. If not provided, the `require('sfcc-ci').manifest.FILENAME` constant is used.

**Returns:** (Promise) Returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
The `resolve` method is called with newly generated manifest file path as parameter
The `reject` method is called with any error message if an error occurs during the comparison process

Example:

```javascript
const sfcc = require('sfcc-ci');

const directories = ['/path/to/repo1', '/path/to/repo2'];
const ignorePatterns = ['test/**/*', 'docs/**/*'];
const targetDirectory = 'path/to/target/directory';
const fileName = 'my_manifest.json';

sfcc.manifest.generate(directories, ignorePatterns, targetDirectory, fileName)
    .then(manifestPath => {
        // do something with the manifest path
    })
    .catch(err => console.log(err));

```

***

### WebDAV ###

APIs available in `require('sfcc').webdav`:

`upload(instance, path, file, token, options, callback)`

Uploads an arbitrary file onto a Commerce Cloud instance.

Param         | Type        | Description
------------- | ------------| --------------------------------
instance      | (String)    | The instance to upload the import file to
path          | (String)    | The path relative to .../webdav/Sites where the file to upload to
file          | (String)    | The file to upload
token         | (String)    | The Oauth token to use use for authentication
options       | (Object)    | The options parameter can contains two properties: pfx: the path to the client certificate to use for two factor authentication. passphrase: the optional passphrase to use with the client certificate
callback      | (Function)  | Callback function executed as a result. The error will be passed as parameter to the callback function.

**Returns:** (void) Function has no return value

***
