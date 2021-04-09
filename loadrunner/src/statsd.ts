import StatsD, { Tags } from "hot-shots";
import newLogger from "./logger";

const statsdLogger = newLogger("statsd");

export default new StatsD({
    prefix: "load-tests.",
    globalTags: {
        "runId": process.env.RUN_ID
    } as Tags,
    errorHandler: function name(error) {
        statsdLogger.warn(error);
    }
});

// Metrics
const RUNNERS = "running.runners";
const CLASSES = "running.classes";
const VUS = "running.vus";

export {
    RUNNERS,
    CLASSES,
    VUS
}
