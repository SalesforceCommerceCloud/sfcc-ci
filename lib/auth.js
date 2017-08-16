var request = require('superagent');
var config = require('./config').obtain();

const accountManagerUrl = 'account.demandware.com/dw/oauth2/access_token';

function auth(client, client_secret, auto_renew) {
    var btoa = require('btoa');

    var basicString = client + ':' + client_secret;
    var basicEncoded = btoa(basicString);

    // progress
    var spinner = new require('cli-spinner').Spinner('Processing... %s')
    spinner.start();

    // attempt to obtain a new token
    request
        .post('https://' + accountManagerUrl)
        .set('Authorization', 'Basic ' + basicEncoded)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('grant_type=client_credentials')
        .end(function (err, res) {
            spinner.stop(true);
            var token = res.body;

            if (!err && res.statusCode == 200) {
                token = res.body.access_token;

                // update the client/token locally
                setClient(client);
                setToken(token);
                setAutoRenewToken(auto_renew, basicEncoded);
                console.log('Authentication succeeded, token obtained successfully.');
            } else {
                console.error('Authentication failed: %s', err);
            }
        });
}

function renewToken() {
    auth(getClient(), 'client_secret', true);
}

function getClient() {
    return config.get('SFCC_CLIENT_ID');
}

function setClient(client) {
    config.set('SFCC_CLIENT_ID', client);
}

function getToken() {
    return config.get('SFCC_CLIENT_TOKEN');
}

function setToken(token) {
    config.set('SFCC_CLIENT_TOKEN', token);
}

function getToken() {
    return config.get('SFCC_CLIENT_TOKEN');
}

function setAutoRenewToken(flag, base64) {
    config.set('SFCC_CLIENT_RENEW_TOKEN', flag);
    config.set('SFCC_CLIENT_RENEW_BASE', base64);
}

function getAutoRenewToken() {
    return config.get('SFCC_CLIENT_RENEW_TOKEN');
}

function getAutoRenewBase64() {
    return config.get('SFCC_CLIENT_RENEW_BASE');
}

function resetToken() {
    config.delete('SFCC_CLIENT_TOKEN');
}

function clear() {
    config.delete('SFCC_CLIENT_ID');
    config.delete('SFCC_CLIENT_TOKEN');
}

module.exports.auth = auth;
module.exports.renewToken = renewToken;
module.exports.getToken = getToken;
module.exports.getClient = getClient;
module.exports.getAutoRenewToken = getAutoRenewToken;
module.exports.getAutoRenewBase64 = getAutoRenewBase64;
module.exports.clear = clear;
module.exports.resetToken = resetToken;