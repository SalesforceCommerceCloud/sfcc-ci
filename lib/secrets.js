var console = require('./log');
var dwjson = require('./dwjson').init();

// read env vars from .env file,
// does not modify env var which has already been set
require('dotenv').config();

/**
 * Look up a secret using a defined lookup strategy.
 *
 * @param {String} value explicitly passed value
 * @param {String} dwjsonProp property name of the secret in dw.json file
 * @param {String} envVarName name of env var which holds the secret
 */
function lookup(value, dwjsonProp, envVarName) {
    // and explicitly passed value always has precedence
    if (value) {
        return value;
    }

    // attempt to lookup secret in dw.json file
    if ( dwjson[dwjsonProp] ) {
        console.debug(`Using secret ${envVarName} from dw.json located at ${process.cwd()}`);
        return dwjson[dwjsonProp];
    }

    // attempt to lookup secret in env var
    // honors env var stored in .env file
    if ( process.env[envVarName] ) {
        console.debug(`Using secret from env var ${envVarName}`);
        return process.env[envVarName];
    }

    // finally throw and error
    throw new Error(`Failed to lookup secret ${envVarName}`);
}

module.exports = {
    getClientID : function (value) {
        return lookup(value, 'client-id', 'SFCC_OAUTH_CLIENT_ID');
    },

    getClientSecret : function (value) {
        return lookup(value, 'client-secret', 'SFCC_OAUTH_CLIENT_SECRET');
    },

    getUsername : function (value) {
        return lookup(value, 'username', 'SFCC_OAUTH_USER_NAME');
    },

    getPassword : function (value) {
        return lookup(value, 'password', 'SFCC_OAUTH_USER_PASSWORD');
    },
    getScapiShortCode : function (value) {
        return lookup(value, 'scapi-shortcode', 'SFCC_SCAPI_SHORTCODE');
    },
    getScapiTenantId : function (value) {
        return lookup(value, 'scapi-tenantid', 'SFCC_SCAPI_TENANTID');
    }
}