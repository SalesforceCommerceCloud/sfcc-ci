const fetch = require('node-fetch');
const fs = require('fs');

const auth = require('./auth');
const secrets = require('./secrets');

function getSlasUrl(tenantId, shortcode, clientId) {
    return `https://${shortcode}.api.commercecloud.salesforce.com/shopper/auth-admin/v1/tenants/${tenantId + (clientId ? ('/clients/' + clientId) : '')}`;
}

async function handleResponse(response) {
    if (response.status > 299) {
        console.error(response)
        throw new Error(`HTTP Fault ${response.status} (${response.statusText})`)
    }

    const resultText = await response.text();
    return JSON.parse(resultText);
}

function handleCLIOutput(result, asJson) {
    if (asJson) {
        console.info(JSON.stringify(result, null, 4))
    } else {
        console.table(result)
    }
}

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
            add: async (tenantId, shortcode, description, merchantName, contact, emailAddress, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.add(tenantId, shortcode, description, merchantName, contact, emailAddress)
                    console.info('sucessfully add tenant')
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not add tenant: ', e.message, asJson)
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
            list: async (shortcode, asJson) => {
                let result
                try {
                    result = await slas.api.tenant.list(shortcode)
                    handleCLIOutput(result, asJson)
                } catch (e) {
                    handleCLIError('Could not get tenants: ', e.message, asJson)
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
            add: async (tenantId, shortcode, fileName, asJson) => {
                let result
                try {
                    result = await slas.api.client.add(tenantId, shortcode, fileName);
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
            add: async (tenantId, shortcode, description, merchantName, contact, emailAddress) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                description = description || `Added by SFCC-CI at ${(new Date()).toISOString()}`
                merchantName = merchantName || tenantId
                contact = contact || auth.getUser()
                emailAddress = emailAddress || (auth.getUser() ? auth.getUser() : 'noreply@salesforce.com')

                const params = {
                    instance: tenantId,
                    description,
                    merchantName,
                    contact,
                    emailAddress
                }

                const response = await fetch(getSlasUrl(tenantId, shortcode, clienId), {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(params)
                });

                return await handleResponse(response);
            },
            get: async (tenantId, shortcode) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await fetch(getSlasUrl(tenantId, shortcode, clienId), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                return await handleResponse(response);
            },
            list: async (shortcode) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const response = await fetch(getSlasUrl('', shortcode), {
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
            add: async (tenantId, shortcode, file) => {
                const token = auth.getToken();

                // set fallbacks
                tenantId = secrets.getScapiTenantId(tenantId);
                shortcode = secrets.getScapiShortCode(shortcode);

                const params = JSON.parse(fs.readFileSync(file, 'utf-8'));

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