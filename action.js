const core = require('@actions/core');
const exec = require('@actions/exec');

(async () => {
    try {
        const command = core.getInput('command', { required: true });

        let result = '';
        await exec.exec('node', command.replace('sfcc-ci', 'cli.js').split(' ').filter(c => c !== ''), {
            listeners: {
                stdout: (data) => {
                    result += data.toString();
                }
            }
        });

        core.setOutput('result', result);
    } catch (error) {
        core.setFailed(error.message);
    }
})();
