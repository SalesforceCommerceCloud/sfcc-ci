const fetch = require('node-fetch');
const fs = require('fs');
const jsonwebtoken = require('jsonwebtoken');

const auth = require('./auth');
const secrets = require('./secrets');


/**
 *  Generates a SLAS Admin Url
 *  @param {string} tenantId the tenant found in BM - e.g bbsv_stg
 *  @param {string} shortcode the shortcode found in BM - e.g acdefg
  * @param {string} [clientId] if provided a client URL is generated
 */
function getSlasUrl(tenantId, shortcode, clientId) {
    const bits = [
        `https://${shortcode}.api.commercecloud.salesforce.com/shopper/auth-admin/v1/tenants`
    ]
    
    if (tenantId) {
        bits.push(tenantId);
    }

    if (clientId) {
        bits.push(`clients/${clientId}`);
    }

    return bits.join('/')
}


/**
 *  Handles fetch response
 *  @param {object} response the http client response
 *  @return {object} the parsed success response
 */
async function handleResponse(response) {
    if (response.ok) {
        return await response.json();
    }

    const contentType = response.headers.get('content-type');
    const isJSON = contentType && contentType.includes('application/json')
    let message;
    if (isJSON) {
        message = await response.json();
    } else {
        message = await response.text();
    }
    console.error(message);
    throw new Error(`HTTP Fault ${response.status} (${response.statusText})`);
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
        tenant : {
            add: async ({shortcode, tenant: instance, tenantdescription: description, merchantName, contact, emailAddress, file, json}) => {
                try {
                    const result = await slas.api.tenant.add({shortcode, instance, description, merchantName, contact, emailAddress, file})
                    console.info('Successfully added tenant')
                    handleCLIOutput(result, json)
                } catch (e) {
                    handleCLIError('Could not add tenant: ', e.message, json)
                }
            },
            get: async ({shortcode, tenant, json}) => {
                try {
                    const result = await slas.api.tenant.get({shortcode, tenant})
                    handleCLIOutput(result, json)
                } catch (e) {
                    handleCLIError('Could not get tenant: ', e.message, json)
                }
            },
            delete: async (tenantId, shortcode, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.delete(tenantId, shortcode)
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not delete tenant: ', e.message, asJson)
                }
            }
        },
        client : {
            add: async (tenantId, shortcode, fileName,clientid, clientname, privateclient,
                ecomtenant, ecomsite, secret, channels, scopes, redirecturis, asJson) => {
                let result
                try {
                    result = await slas.api.client.add(tenantId, shortcode, fileName, clientid, clientname,
                        privateclient, ecomtenant, ecomsite, secret, channels, scopes, redirecturis);
                    console.info('sucessfully add client ')
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not add client: ', e.message, asJson)
                }
            },
            get: async ({shortcode, tenant, client}) => {
                try {
                    const result = await slas.api.client.get({shortcode, tenant, client})
                    console.dir(result)
                } catch (e) {
                    handleCLIError('Could not get client: ', e.message)
                }
            },
            list: async ({shortcode, tenant}) => {
                try {
                    const result = await slas.api.client.list({shortcode, tenant});
                    console.dir(result, {depth: null});
                } catch (e) {
                    handleCLIError('Could not list clients: ', e.message)
                }
            },
            delete: async (tenantId, shortcode, clientId, asJson) => {
                let result
                try {
                    result = await slas.api.client.delete(tenantId, shortcode, clientId)
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not delete tenant: ', e.message, asJson)
                }
            }
        }
    },
    api: {
        tenant: {
            add: async ({shortcode, instance, file}) => {
                const token = auth.getToken();

                shortcode = secrets.getScapiShortCode(shortcode);

                let body
                if (!file) {
                    instance = secrets.getScapiTenantId(instance);
                    body = {
                        instance,
                        description: `Added by SFCC-CI at ${(new Date()).toISOString()}`,
                        emailAddress: jsonwebtoken.decode(token).sub
                    }
                } else {
                    body = JSON.parse(fs.readFileSync(file, 'utf-8'));
                    instance = secrets.getScapiTenantId(instance || body.instance);
                }

                const url = getSlasUrl(instance, shortcode)
                const options = {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }

                const response = await fetch(url, options);
                return await handleResponse(response);
            },
            get: async ({shortcode, tenant}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenant = secrets.getScapiTenantId(tenant);

                const url = getSlasUrl(tenant, shortcode)
                const options = {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${auth.getToken()}`,
                        'Content-Type': 'application/json'
                    }
                }
                const response = await fetch(url, options);
                return await handleResponse(response);
            },
            delete: async ({shortcode, tenant}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenant = secrets.getScapiTenantId(tenant);

                const url = getSlasUrl(tenantId, shortcode);
                const options = {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${await auth.getToken()}`,
                        'Content-Type': 'application/json'
                    }
                }
                const response = await fetch(url, options);
                return await handleResponse(response);
            },
        },
        client: {
            add: async (tenantId, shortcode, file, clientid, clientname, privateclient,
                ecomtenant, ecomsite, secret, channels, scopes, redirecturis,) => {
                const token = auth.getToken();

                // set fallbacks
                shortcode = secrets.getScapiShortCode(shortcode);
                let params;
                if (file) {
                    params = JSON.parse(fs.readFileSync(file, 'utf-8'));
                } else {
                    params = {
                        cliendId: clientid,
                        name: clientname,
                        isPrivateClient: privateclient,
                        ecomTenant: ecomtenant,
                        ecomSite: ecomsite,
                        secret: secret,
                        channels: channels,
                        scopes: scopes,
                        redirectUri: redirecturis
                    }
                }
                tenantId = secrets.getScapiTenantId(tenantId || params.ecomTenant);
                const response = await fetch(getSlasUrl(tenantId, shortcode, params.clientId), {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(params)
                });

                return await handleResponse(response);
            },
            get: async ({shortcode, tenant, client}) => {
                tenant = secrets.getScapiTenantId(tenant);
                client = secrets.getScapiShortCode(client);

                const url = getSlasUrl(tenant, shortcode, client);
                const options = {
                    headers: {
                        'Authorization': `Bearer ${auth.getToken()}`,
                        'Content-Type': 'application/json'
                    }
                }
                const response = await fetch(url, options);
                return await handleResponse(response);
            },
            list: async ({shortcode, tenant}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenantId = secrets.getScapiTenantId(tenant);

                const url = getSlasUrl(tenant, shortcode) + '/clients'
                const options = {
                    headers: {
                        'Authorization': `Bearer ${auth.getToken()}`,
                        'Content-Type': 'application/json'
                    }
                }
                const response = await fetch(url, options);
                return await handleResponse(response);
            },
            delete: async (tenantId, shortcode, clientId) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await fetch(getSlasUrl(tenantId, shortcode, clientId), {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                return await handleResponse(response);
            },
        }
    }
}

module.exports = slas;