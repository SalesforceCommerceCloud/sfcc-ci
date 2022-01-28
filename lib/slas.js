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
    return `https://${shortcode}.api.commercecloud.salesforce.com/shopper/auth-admin/v1/tenants/${tenantId
        + (clientId ? ('/clients/' + clientId) : '')}`;
}


/**
 *  Handles fetch response
 *  @param {object} response the http client response
 *  @return {object} the parsed success response
 */
async function handleResponse(response) {
    if (!response.ok) {
        console.error(await response.text());
        throw new Error(`HTTP Fault ${response.status} (${response.statusText})`)
    }

    const data = await response.json();
    return data;
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
                let result
                try {
                    result = await slas.api.tenant.add({shortcode, instance, description, merchantName, contact, emailAddress, file})
                    console.info('Successfully added tenant')
                    handleCLIOutput(result, json)
                } catch (e) {
                    handleCLIError('Could not add tenant: ', e.message, json)
                }
            },
            get: async (tenantId, shortcode, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.get(tenantId, shortcode)
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not get tenant: ', e.message, asJson)
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
            get: async (tenantId, shortcode, clientId, asJson) => {
                let result
                try {
                    result = await slas.api.client.get(tenantId, shortcode, clientId)
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not get tenant: ', e.message, asJson)
                }
            },
            list: async (shortcode, tenantId, asJson) => {
                let result
                try {
                    result = await slas.api.client.list(shortcode, tenantId);
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
            add: async ({shortcode, instance, description, merchantName, contact, emailAddress, file}) => {
                const token = auth.getToken();
                const userEmail = jsonwebtoken.decode(token).sub
                
                shortcode = secrets.getScapiShortCode(shortcode);

                let body
                if (!file) {
                    instance = secrets.getScapiTenantId(instance);
                    description = description || `Added by SFCC-CI at ${(new Date()).toISOString()}`
                    contact = contact || auth.getUser() || userEmail
                    emailAddress = emailAddress || auth.getUser() || userEmail

                    body = {
                        instance,
                        description,
                        merchantName,
                        contact,
                        emailAddress
                    }
                } else {
                    body = JSON.parse(fs.readFileSync(file, 'utf-8'));
                    console.log({body})
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
            get: async (tenantId, shortcode) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await fetch(getSlasUrl(tenantId, shortcode), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                return await handleResponse(response);
            },
            delete: async (tenantId, shortcode) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await fetch(getSlasUrl(tenantId, shortcode), {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

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
            get: async (tenantId, shortcode, clientId) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await fetch(getSlasUrl(tenantId, shortcode, clientId), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                return await handleResponse(response);
            },
            list: async (shortcode, tenantId) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await fetch(getSlasUrl(tenantId, shortcode) + '/clients', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
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