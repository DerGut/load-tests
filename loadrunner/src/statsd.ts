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
const ERRORS = "errors";
const EXERCISES_SUBMITTED = "submitted.exercices";
const TASKSERIES_SUBMITTED = "submitted.taskseries";

export {
    RUNNERS,
    CLASSES,
    VUS,
    ERRORS,
    EXERCISES_SUBMITTED,
    TASKSERIES_SUBMITTED,
}
