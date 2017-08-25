# Salesforce Commerce Cloud CI #

The Salesforce Commerce Cloud CI is a command line interface (CLI) for interacting with Commerce Cloud instances from the command line / shell of various operating systems in order to facilitate Continous Integration practices using Commerce Cloud.

## What is this repository for? ##

* Quick summary
* Version
* [Learn Markdown](https://bitbucket.org/tutorials/markdowndemo)

## How do I get set up? ##

### Prerequisites ###

Ensure you have a valid Open Commerce API client ID set up. You'll need the client ID as well as the client secret. If you don't have a Open Commerce API client ID yet, you can create one using the [Account Manager](https://account.demandware.com).

### Configuration ###

In order to perform certain commands the tool provides, you need to give permission to do that on your Commerce Cloud instance(s). You can do that by modifying the Open Commerce API Settings. 

1. Log into the Business Manager
2. Navigate to Administration > Site Development > Open Commerce API Settings
3. Make sure, that you select _Data API_ and _Global_ from the select boxes
4. Add the permission set for your client ID to the settings. Use the following snippet as your client's permission set, replace `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` with your client ID:
`
    {
      "client_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "resources":
      [
        {
          "resource_id":"/code_versions/*",
          "methods":["patch"],
          "read_attributes":"(**)",
          "write_attributes":"(**)"
        },
        {
          "resource_id":"/jobs/*/executions",
          "methods":["post"],
          "read_attributes":"(**)",
          "write_attributes":"(**)"
        },
        {
          "resource_id":"/jobs/*/executions/*",
          "methods":["get"],
          "read_attributes":"(**)",
          "write_attributes":"(**)"
        }
      ]
    }
`

### Dependencies ###

You need Node.js and npm to be installed. No other dependencies.

### Installation Instructions ###

* Make sure Node.js and npm are installed.
* Clone or download this tool.
* `cd` into the directory and run `npm install`

You are now ready to use the tool by running the main command `sfcc-ci`. 

## Using the Tool ##

Use `sfcc-ci --help` to get started and see the list of commands available. Use `sfcc-ci <sub:command> --help` to get detailed help and example usage of a sub:command.