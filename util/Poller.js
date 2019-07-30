
const EventEmitter = require('events');

/**
 * This class provides a more convenient method to handle polling
 *
 * While polling we allow to react on predefined results, occuring after each polling step
 */
class Poller extends EventEmitter {
    /**
     * @param {int} timeout - todo
     */
    constructor(timeout = 1000, errorThreshold = 3) {
        super();
        this.timeout = timeout;
        this.timeoutID = null;
        this.errorThreshold = errorThreshold;

        // updated through polling
        this.errorResponse = null;

        this.errorThresholdContinue = false;
        this.isTimeoutExceeded = false;
        this.hasEnded = false;
        this.hasGeneralError = false;
        this.hasError = false;

        this.stepResult = {};
    }
    next() {
        // reset threshold
        this.errorThresholdContinue = false;

        if (this.hasEnded) {
            clearTimeout(this.timeoutID);
            return {};
        }
        if (this.isTimeoutExceeded) {
            this.hasError = true;
        } else if (this.hasGeneralError) {
            this.hasError = true;
        } else if (this.errorResponse && this.errorThreshold === 0) {
            this.hasError = true;
        } else if (this.errorResponse && this.errorThreshold > 0) {
            this.errorThreshold--;
            this.errorThresholdContinue = true;
        }
        if (this.hasError) {
            clearTimeout(this.timeoutID);
            return;
        }
        this.timeoutID = setTimeout(() => this.emit('poll'), this.timeout);
    }

    start(cb) {
        this.on('poll', cb);
    }
}

module.exports = Poller;