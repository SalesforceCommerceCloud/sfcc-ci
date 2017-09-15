var spinner = new require('cli-spinner').Spinner('Processing... %s');

function start() {
    spinner.start();
    return spinner;
}

function stop() {
    spinner.stop(true);
    return spinner;
}

module.exports.start = start;
module.exports.stop = stop;