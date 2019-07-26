
const EventEmitter = require('events');

/**
 * This class provides a more convenient method to handle polling
 *
 * While polling we allow to react on predefined results, occuring after each polling step, by returning the stepResult
 *
 * stepResult:
 *  isExceeded: Stops the polling and return status object
 *  errorThresholdContinue: Continue polling and return status object
 *  errorThresholdExceeded: Stops polling and return status object
 */
class Poller extends EventEmitter {
    /**
     * @param {int} timeout - todo
     */
    constructor(timeout = 1000, errorThreshold = 3) {
        super();
        this.timeout = timeout;
        this.errorThreshold = errorThreshold;

        // updated through polling
        this.isExceeded = false;
        this.errorResponse = null;
        this.hasEnded = false;

        this.stepResult = {};
    }

    next() {
        if (this.hasEnded) {
            clearInterval(this.timeout);
            return {};
        }
        if (this.isExceeded) {
            clearInterval(this.timeout);
            this.stepResult.hasError = true;
            return this.stepResult.isExceeded = true;
        } else if (this.errorResponse && this.errorThreshold === 0) {
            clearInterval(this.timeout);
            this.stepResult.hasError = true;
            return this.stepResult.errorThresholdExceeded = true;
        } else if (this.errorResponse && this.errorThreshold > 0) {
            this.errorThreshold--;
            this.stepResult.errorThresholdContinue = true;
        }
        setTimeout(() => this.emit('poll'), this.timeout);
    }


    start(cb) {
        this.on('poll', cb);
    }
}

module.exports = Poller;