const fs = require('fs');
const request = require('request');
if (process.env.DEBUG) {
    require('request-debug')(request);
}

const auth = require('./auth');
const secrets = require('./secrets');

/**
 * Wraps "request" asynchronously to factor-out node-fetch usage from this project
 * Intended to be replaced with different/modern module after "request" is deprecated from this project
 * @param {string} url
 * @param {object} options
 * @returns {Promise<object>}
 */
function asyncRequest(url, options) {
    return new Promise(function (resolve, reject) {
        request(url, options, function (err, res) {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        })
    })
}

/**
 *  Generates a SLAS Admin Url
 *  @param {string} tenantId the tenant found in BM - e.g bbsv_stg
 *  @param {string} shortcode the shortcode found in BM - e.g acdefg
 * @param {string} [clientId] if provided a client URL is generated
 */
function getSlasUrl(tenantId, shortcode, clientId) {
    return `https://${shortcode}.api.commercecloud.salesforce.com/shopper/auth-admin/v1/tenants/${tenantId
        + (clientId ? ('/clients/' + clientId) : '')}`;
}


/**
 *  Handles fetch response
 *  @param {object} response the http client response
 *  @return {object} the parsed success response
 */
async function handleResponse(response) {
    if (response.statusCode > 299) {
        throw new Error(`HTTP Fault ${response.statusCode} (${response.statusMessage})`)
    }

    if (response.statusCode === 204) {
        return 'Success, 204: No Content';
    }

    return response.body;
}

/**
 *  Provides the command line return statements
 *  @param {object} result the http client response
 *  @param {boolean} asJson true if a technical format should be provided
 */
function handleCLIOutput(result, asJson) {
    if (asJson) {
        console.info(JSON.stringify(result, null, 4))
    } else {
        console.table(result)
    }
}

/**
 *  Provides the command line errors
 *  @param {object} result the http client response
 *  @param {boolean} asJson true a technical format should be provided
 */
function handleCLIError(prefix, message, asJson) {
    if (asJson) {
        console.info(JSON.stringify({prefix, message}, null, 4))
    } else {
        console.error(prefix + message)
    }
}


const slas = {
    cli: {
        tenant: {
            add: async (tenantId, shortcode, description, merchantName, contact, emailAddress, fileName, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.add(tenantId, shortcode,
                        description, merchantName, contact, emailAddress, fileName, auth.getToken())
                    console.info('sucessfully added tenant')
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not add tenant: ', e.message, asJson)
                }
            },
            get: async (tenantId, shortcode, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.get(tenantId, shortcode, auth.getToken())
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not get tenant: ', e.message, asJson)
                }
            },
            list: async (shortcode, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.list(shortcode, auth.getToken())
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not get tenants: ', e.message, asJson)
                }
            },
            delete: async (tenantId, shortcode, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.delete(tenantId, shortcode, auth.getToken())
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not delete tenant: ', e.message, asJson)
                }
            }
        },
        client : {
            add: async (tenantId, shortcode, fileName,clientid, clientname, privateclient,
                ecomtenant, ecomsite, secret, channels, scopes, redirecturis, callbackuris, asJson) => {
                let result
                try {
                    result = await slas.api.client.add(tenantId, shortcode, fileName, clientid, clientname,
                        privateclient, ecomtenant, ecomsite, secret, channels, scopes, redirecturis,
                        callbackuris, auth.getToken());
                    console.info('sucessfully added client ')
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not add client: ', e.message, asJson)
                }
            },
            get: async (tenantId, shortcode, clientId, asJson) => {
                let result
                try {
                    result = await slas.api.client.get(tenantId, shortcode, clientId, auth.getToken())
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not get tenant: ', e.message, asJson)
                }
            },
            list: async (tenantId, shortcode, asJson) => {
                let result
                try {
                    result = await slas.api.client.list(shortcode, tenantId, auth.getToken());
                    if (asJson) {
                        console.info(JSON.stringify(result, null, 4));
                    } else {
                        result.data.forEach((element) => console.table(element));
                    }
                } catch (e) {
                    handleCLIError('Could not get tenants: ', e.message, asJson)
                }
            },
            delete: async (tenantId, shortcode, clientId, asJson) => {
                let result
                try {
                    result = await slas.api.client.delete(tenantId, shortcode, clientId, auth.getToken())
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not delete tenant: ', e.message, asJson)
                }
            }
        }
    },
    api: {
        tenant: {
            add: async (tenantId, shortcode, description, merchantName, contact, emailAddress, fileName, token) => {
                let params
                // set fallbacks
                shortcode = secrets.getScapiShortCode(shortcode);
                if (!fileName) {
                    tenantId = secrets.getScapiTenantId(tenantId);
                    description = description || `Added by SFCC-CI at ${(new Date()).toISOString()}`
                    merchantName = merchantName || tenantId
                    contact = contact || auth.getUser()
                    emailAddress = emailAddress || (auth.getUser() ? auth.getUser() : 'noreply@salesforce.com')

                    params = {
                        instance: tenantId,
                        description,
                        merchantName,
                        contact,
                        emailAddress
                    }
                } else {
                    params = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
                    tenantId = secrets.getScapiTenantId(tenantId || params.instance);
                }
                const response = await asyncRequest(getSlasUrl(tenantId, shortcode), {
                    method: 'PUT',
                    auth: {bearer: token},
                    json: true,
                    body: params
                });

                return await handleResponse(response);
            },
            get: async (tenantId, shortcode, token) => {
                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await asyncRequest(getSlasUrl(tenantId, shortcode), {
                    method: 'GET',
                    auth: {bearer: token},
                    json: true
                });

                return await handleResponse(response);
            },
            list: async (shortcode, token) => {
                // set fallbacks
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await asyncRequest(getSlasUrl('', shortcode), {
                    method: 'GET',
                    auth: {bearer: token},
                    json: true
                });
                return await handleResponse(response);
            },
            delete: async (tenantId, shortcode) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await asyncRequest(getSlasUrl(tenantId, shortcode), {
                    method: 'DELETE',
                    auth: {bearer: token}
                });

                return await handleResponse(response);
            },
        },
        client: {
            add: async (tenantId, shortcode, file, clientid, clientname, privateclient,
                ecomtenant, ecomsite, secret, channels, scopes, redirecturis, callbackuris, token) => {
                // set fallbacks
                shortcode = secrets.getScapiShortCode(shortcode);
                let params;
                if (file) {
                    params = JSON.parse(fs.readFileSync(file, 'utf-8'));
                } else {
                    params = {
                        clientId: clientid,
                        name: clientname,
                        isPrivateClient: privateclient,
                        ecomTenant: ecomtenant,
                        ecomSite: ecomsite,
                        secret: secret,
                        channels: channels,
                        scopes: scopes,
                        redirectUri: redirecturis || [],
                        callbackUri: callbackuris || []
                    }
                }
                tenantId = secrets.getScapiTenantId(tenantId || params.ecomTenant);
                const response = await asyncRequest(getSlasUrl(tenantId, shortcode, params.clientId), {
                    method: 'PUT',
                    auth: {bearer: token},
                    json: true,
                    body: params
                });
                return await handleResponse(response);
            },
            get: async (tenantId, shortcode, clientId, token) => {
                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await asyncRequest(getSlasUrl(tenantId, shortcode, clientId), {
                    method: 'GET',
                    auth: {bearer: token},
                    json: true
                });

                return await handleResponse(response);
            },
            list: async (shortcode, tenantId, token) => {
                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await asyncRequest(getSlasUrl(tenantId, shortcode) + '/clients', {
                    method: 'GET',
                    auth: {bearer: token},
                    json: true
                });

                return await handleResponse(response);
            },
            delete: async (tenantId, shortcode, clientId, token) => {
                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await asyncRequest(getSlasUrl(tenantId, shortcode, clientId), {
                    method: 'DELETE',
                    auth: {bearer: token},
                    json: true
                });

                return await handleResponse(response);
            },
        }
    }
}

module.exports = slas;
