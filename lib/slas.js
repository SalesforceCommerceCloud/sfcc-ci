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
function getSlasUrl({shortcode, tenant, client}) {
    const bits = [`https://${shortcode}.api.commercecloud.salesforce.com/shopper/auth-admin/v1/tenants`]
    tenant && bits.push(tenant);
    client && bits.push(`clients/${client}`);
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

async function read(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
}
  
const slas = {
    cli: {
        tenant : {
            add: async ({shortcode, tenant, file, json}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenant = secrets.getScapiTenantId(tenant);

                try {
                    const result = await slas.api.tenant.add({shortcode, tenant, file})
                    console.info('Successfully added tenant')
                    handleCLIOutput(result, json)
                } catch (e) {
                    handleCLIError('Could not add tenant: ', e.message, json)
                }
            },
            get: async ({shortcode, tenant, json}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenant = secrets.getScapiTenantId(tenant);

                try {
                    const result = await slas.api.tenant.get({shortcode, tenant})
                    handleCLIOutput(result, json)
                } catch (e) {
                    handleCLIError('Could not get tenant: ', e.message, json)
                }
            }
        },
        client : {
            add: async ({shortcode, tenant, client, file}) => {
                if (!file) {
                    throw new Error('Option --file is required.');
                }
                
                shortcode = secrets.getScapiShortCode(shortcode);
                tenant = secrets.getScapiTenantId(tenant);

                // Ensure `file` is valid JSON.
                const body = JSON.parse(fs.readFileSync(file, 'utf-8'));
                // Provided Client ID overrides JSON.
                body.clientId = client

                try {
                    const result = await slas.api.client.add({shortcode, tenant, client, body});
                    console.info('Successfully added client')
                    handleCLIOutput(result, true)
                } catch (e) {
                    handleCLIError('Could not add client: ', e.message, true)
                }
            },
            get: async ({shortcode, tenant, client}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenant = secrets.getScapiTenantId(tenant);

                try {
                    const result = await slas.api.client.get({shortcode, tenant, client})
                    console.log(JSON.stringify(result, null, 4))
                } catch (e) {
                    handleCLIError('Could not get client: ', e.message)
                }
            },
            list: async ({shortcode, tenant}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenantId = secrets.getScapiTenantId(tenant);

                try {
                    const result = await slas.api.client.list({shortcode, tenant});
                    console.dir(result, {depth: null});
                } catch (e) {
                    handleCLIError('Could not list clients: ', e.message)
                }
            },
            delete: async ({shortcode, tenant, client}) => {
                shortcode = secrets.getScapiShortCode(shortcode);
                tenant = secrets.getScapiTenantId(tenant);

                try {
                    const result = await slas.api.client.delete({shortcode, tenant, client})
                    handleCLIOutput(result, true)
                } catch (e) {
                    handleCLIError('Could not delete tenant: ', e.message, true)
                }
            }
        }
    },
    api: {
        tenant: {
            add: async ({shortcode, tenant, file}) => {
                const token = auth.getToken();

                let body
                if (!file) {
                    body = {
                        instance: tenant,
                        description: `Added by SFCC-CI at ${(new Date()).toISOString()}`,
                        emailAddress: jsonwebtoken.decode(token).sub,
                        merchantName: '_'
                    }
                } else {
                    body = JSON.parse(fs.readFileSync(file, 'utf-8'));
                    // Provided `tenant` overrides `instance` from JSON.
                    body.instance = tenant
                }

                const url = getSlasUrl({shortcode, tenant})
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
                const url = getSlasUrl({tenant, shortcode})
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
        },
        client: {
            add: async ({shortcode, tenant, client, body}) => {
                const url = getSlasUrl({shortcode, tenant, client})
                const options = {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${auth.getToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
                const response = await fetch(url, options);
                return await handleResponse(response);
            },
            get: async ({shortcode, tenant, client}) => {
                const url = getSlasUrl({shortcode, tenant, client});
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
                const url = getSlasUrl({tenant, shortcode}) + '/clients'
                const options = {
                    headers: {
                        'Authorization': `Bearer ${auth.getToken()}`,
                        'Content-Type': 'application/json'
                    }
                }
                // TODO: If no clients belong to this tenant, SLAS returns a HTTP 404.
                const response = await fetch(url, options);
                return await handleResponse(response);
            },
            delete: async ({shortcode, tenant, client}) => {
                const url = getSlasUrl({shortcode, tenant, client});
                const options = {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${auth.getToken()}`,
                        'Content-Type': 'application/json'
                    }
                };
                const response = await fetch(url, options);
                return await handleResponse(response);
            },
        }
    }
}

module.exports = slas;