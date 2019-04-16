# Salesforce Commerce Cloud CLI #

The Salesforce Commerce Cloud CLI is a command line interface for interacting with Commerce Cloud instances from the command line / shell of various operating systems in order to facilitate Continuous Integration practices using Commerce Cloud. It provides a JavaScript API which can be used to integrate with higher level build tools and other applications.

# License #

Licensed under the current NDA and licensing agreement in place with your organization. (This is explicitly not open source licensing.)

# Who do I talk to? #

Feel free to create issues and enhancement requests or discuss on the existing ones, this will help us understanding in which area the biggest need is. Please refer to documentation below before doing so.

For discussions please start a topic on the [Community Suite discussion board](https://xchange.demandware.com/community/developer/community-suite/content) or join the [Google Hangout Group](https://hangouts.google.com/group/BJgvcyxpkieawZUg2).

* Maintainer: @tobiaslohr
* [Google Hangout Group](https://hangouts.google.com/group/BJgvcyxpkieawZUg2)

# What is this repository for? #

The focus of the tool is to streamline and easy the communication with Commerce Cloud instances as part of the CI/CD processes. It focuses on the deployment part supporting quality checks such as test execution, not on the quality checks itself.

**Features:**

* Uses Open Commerce APIs completely
* Authentication using Oauth2 only, no Business Manager user needed
* Interactive and headless authentication
* Configuration of multiple instances incl. aliasing
* WebDAV connectivity
* Code deployment and code version management
* System job execution and monitory (site import, state save and sate reset)
* Custom job execution and monitoring
* JavaScript API

# How do I get set up? #

## Prerequisites ##

### Configure an API key ###

Ensure you have a valid Commerce Cloud API key (client ID) set up. If you don't have a API key, you can create one using the [Account Manager](https://account.demandware.com).

For automation (e.g. a build server integration) you'll need the API key as well as the API secret for authentication. If you plan to use the interactive mode, you have to configure your API client to use redirect url `http://localhost:8080`. You do this when you create a new or modify an existing Client ID in Account Manager via the _Redirect URIs_ setting.

### Grant your API key access to your instances ###

In order to perform CLI commands, you have to permit API calls to the Commerce Cloud instance(s) you wish to integrate with. You do that by modifying the Open Commerce API Settings as well as the WebDAV Client Permissions on the Commerce Cloud instance.

1. Log into the Business Manager
2. Navigate to _Administration > Site Development > Open Commerce API Settings_
3. Make sure, that you select _Data API_ and _Global_ from the select boxes
4. Add the permission set for your client ID to the settings. 

Use the following snippet as your client's permission set, replace `my_client_id` with your own client ID. Note, if you already have Open Commerce API Settings configured on your instance, e.g. for other API keys, you have to merge this permission set into the existing list of permission sets for the other clients.
```JSON
    {
      "_v": "19.1",
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
              "methods": ["patch"],
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
            }
          ]
        }
      ]
    }
```

## Dependencies ##

If you plan to integrate with the JavaScript API or if you want to download the sources and use the CLI through Node you need Node.js and npm to be installed. No other dependencies.

If do not want to use the JavaScript API, but just the CLI you don't need Node.js and npm necessarily. See "Installation Instructions" for details below.

## Installation Instructions ##

You can install the CLI using a pre-built binary or from source using Node.js.

### Install Prebuilt Binary ###

If you are using the CLI but don't want to mess around with Node.js you can simply download the latest binaries for your OS at [Releases](https://github.com/SalesforceCommerceCloud/sfcc-ci/releases/latest). The assets with each release contain binaries for MacOS, Linux and Windows.

#### MacOS ####

1. Download the binary for MacOS.

2. Move the binary in to your PATH:

        sudo mv ./sfcc-ci-macos /usr/local/bin/sfcc-ci

### Linux ###

1. Download the binary for Linux.

2. Move the binary in to your PATH:

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

Use `sfcc-ci --help` to get started and see the list of commands available:

```bash
  Usage: sfcc-ci [options] [command]

  Options:

    -V, --version                                                   output the version number
    -D, --debug                                                     enable verbose output
    -h, --help                                                      output usage information

  Commands:

    auth:login [options] <client>                                   Authenticate a present user for interactive use
    auth:logout                                                     End the current sessions and clears the authentication
    client:auth [options] [client] [secret] [user] [user_password]  Authenticate an API client with an optional user for automation use
    client:auth:renew                                               Renews the client authentication. Requires the initial client authentication to be run with the --renew option.
    client:auth:token                                               Return the current authentication token
    instance:add [options] <instance> [alias]                       Adds a new Commerce Cloud instance to the list of configured instances
    instance:set <alias_or_host>                                    Sets a Commerce Cloud instance as the default instance
    instance:clear                                                  Clears all configured Commerce Cloud instances
    instance:list [options]                                         List instance and client details currently configured
    instance:upload [options] <archive>                             Uploads an instance import file onto a Commerce Cloud instance
    instance:import [options] <archive>                             Perform a instance import (aka site import) on a Commerce Cloud instance
    instance:state:save [options]                                   Perform a save of the state of a Commerce Cloud instance
    instance:state:reset [options]                                  Perform a reset of a previously saved state of a Commerce Cloud instance
    code:list [options]                                             List all custom code versions deployed on the Commerce Cloud instance
    code:deploy [options] <archive>                                 Deploys a custom code archive onto a Commerce Cloud instance
    code:activate [options] <version>                               Activate the custom code version on a Commerce Cloud instance
    job:run [options] <job_id> [job_parameters...]                  Starts a job execution on a Commerce Cloud instance
    job:status [options] <job_id> <job_execution_id>                Get the status of a job execution on a Commerce Cloud instance

  Environment:

    $SFCC_LOGIN_URL         set login url used for authentication
    $SFCC_OAUTH_LOCAL_PORT  set Oauth local port for authentication flow
    $DEBUG                  enable verbose output

  Detailed Help:

    Use sfcc-ci <sub:command> --help to get detailed help and example usage of sub:commands
```

Use `sfcc-ci <sub:command> --help` to get detailed help and example usage of a sub:command.

## Configuration ##

The CLI keeps it's own settings. The location of these settings are OS specific. On Linux they are located at `$HOME/.config/sfcc-ci-nodejs/`, on MacOS they are located at `$HOME/Library/Preferences/sfcc-ci-nodejs/`.

## Environment Variables ##

The use of environment variables is optional. `sfcc-ci` respects the following environment variables which you can use to control, how the CLI works:

* `SFCC_LOGIN_URL` The login url used for authentication.
* `SFCC_OAUTH_LOCAL_PORT` Oauth local port for authentication flow.
* `DEBUG` Debugging mode.

If you only want a single CLI command to write debug messages prepend the command using, e.g. `DEBUG=* sfcc-ci <sub:command>`.

## Authentication ##

`sfcc-ci` uses a default authorization server. You can overwrite this authorization server and use an alternative login url using the env var `SFCC_LOGIN_URL`:

```bash
export SFCC_LOGIN_URL=<alternative-authorization-server>
```

Removing the env var (`unset SFCC_LOGIN_URL`) will make the CLI use the default authorization server again.

## Oauth Local Port ##

`sfcc-ci` uses a default Oauth local port for authentication flow via command `sfcc-ci auth:login`. You can overwrite this port and use an alternative port number (e.g. if the default port is used on your machine and you cannot use is) using the env var `SFCC_OAUTH_LOCAL_PORT`:

```bash
export SFCC_OAUTH_LOCAL_PORT=<alternative-port>
```

Removing the env var (`unset SFCC_OAUTH_LOCAL_PORT`) will make the CLI use the default port again.

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

In an automation scenario (where no user is physically present) authentication is done as follows:

```bash
sfcc-ci client:auth $API_KEY $API_SECRET $API_USER $API_USER_PW
```

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

Running the instance import without waiting for the import to finish you omit the `--sync,-s` flag:

```bash
sfcc-ci instance:import <data.zip> -i your-instance.demandware.net
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
  const sfcc_code = require('sfcc-ci').code;
  const sfcc_instance = require('sfcc-ci').instance;
  const sfcc_job = require('sfcc-ci').job;
  const sfcc_webdav = require('sfcc-ci').webdav;
```

The following APIs are available (assuming `sfcc` refers to `require('sfcc-ci')`):

```javascript
  sfcc.auth.auth(client_id, client_secret, callback);
  sfcc.code.activate(instance, code_version, token, callback);
  sfcc.code.deploy(instance, archive, token, options, callback);
  sfcc.code.list(instance, token, callback);
  sfcc.instance.upload(instance, file, token, options, callback);
  sfcc.instance.import(instance, file_name, token, callback);
  sfcc.job.run(instance, job_id, job_params, token, callback);
  sfcc.job.status(instance, job_id, job_execution_id, token, callback);
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
token         | (String)    | The Oauth token to use use for authentication
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
