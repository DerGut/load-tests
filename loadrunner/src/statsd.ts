import StatsD from "hot-shots";

export default new StatsD({
    prefix: "load-tests.",
    globalTags: {
        "runId": process.env.RUN_ID
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
