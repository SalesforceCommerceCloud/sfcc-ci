const auth = require('./auth');
const fetch = require('node-fetch');

function getSlasUrl(tenantId, shortcode) {
    return `https://${shortcode}.api.commercecloud.salesforce.com/shopper/auth-admin/v1/tenants/${tenantId}`
}

const slas = {
    cli: {
        tenant : {
            add: async (tenantId, shortcode, description, merchantName, contact, emailAddress) => {
                let result
                try {
                    result = await slas.api.tenant.add(tenantId, shortcode, description, merchantName, contact, emailAddress)
                    console.info('sucessfully add tenant ')
                    console.table(result)
                } catch (e) {
                    console.error('Could not add tenant: ' + e.message)
                }
            },
            get: async (tenantId, shortcode) => {
                let result
                try {
                    result = await slas.api.tenant.get(tenantId, shortcode)
                    console.table(result)
                } catch (e) {
                    console.error('Could not get tenant: ' + e.message)
                }
            },
            delete: async (tenantId, shortcode) => {
                let result
                try {
                    result = await slas.api.tenant.delete(tenantId, shortcode)
                    console.table(result)
                } catch (e) {
                    console.error('Could not get tenant: ' + e.message)
                }
            }
        }
    },
    api: {
        tenant: {
            add: async (tenantId, shortcode, description, merchantName, contact, emailAddress) => {
                const token = auth.getToken();

                // set fallbacks
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
                console.table(params);

                const response = await fetch(getSlasUrl(tenantId, shortcode), {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(params)
                });

                if (response.status > 299) {
                    console.error(response)
                    throw new Error(`HTTP Fault ${response.status} (${response.statusText})`)
                }

                const resultText = await response.text();
                return JSON.parse(resultText);
            },
            get: async (tenantId, shortcode) => {
                const token = auth.getToken();

                const response = await fetch(getSlasUrl(tenantId, shortcode), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.status > 299) {
                    throw new Error(`HTTP Fault ${response.status} (${response.statusText})`)
                }
                const resultText = await response.text();
                return JSON.parse(resultText);
            },
            delete: async (tenantId, shortcode) => {
                const token = auth.getToken();

                const response = await fetch(getSlasUrl(tenantId, shortcode), {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.status > 299) {
                    throw new Error(`HTTP Fault ${response.status} (${response.statusText})`)
                }
                const resultText = await response.text();
                return JSON.parse(resultText);
            },
        }
    }
}

module.exports = slas;