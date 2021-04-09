import "dd-trace/init";

import { chromium } from "playwright-chromium";

import { root as rootLogger } from "./logger";
import statsd, { CLASSES, RUNNERS } from "./statsd";
import LoadRunner from "./runner";

(async () => {
    const { runID, url, accounts } = parseArgs(process.argv);

    rootLogger.info(`Testing ${url} with ${accounts.length} classes`);
    rootLogger.info(`runID: ${runID}`);

    statsd.gauge("test", 2);

    const browser = await chromium.launch({ 
        headless: true, 
        slowMo: 200,
        args: [
            "--disable-dev-shm-usage", 
            "--full-memory-crash-report"
        ]
    });

    const lr = new LoadRunner(browser, runID, url, accounts);
    process.on("SIGINT", async () => {
        rootLogger.info("Received SIGINT");
        statsd.decrement(RUNNERS);
        statsd.decrement(CLASSES, accounts.length);
        await browser.close();
    });
    process.on("beforeExit", () => {
        rootLogger.info("Exiting");
        statsd.decrement(RUNNERS);
        statsd.decrement(CLASSES, accounts.length);
    });

    statsd.increment(RUNNERS);
    await lr.start();
    rootLogger.info(`Started all ${accounts.length} users`);
})();

function parseArgs(args: string[]): { runID: string, url: string, accounts: Classroom[] } {
    let runID: string, url: string, accounts: string;
    if (args.length > 2) {
        if (args.length < 5) {
            rootLogger.error("Not enough arguments provided");
            process.exit(1);
        }
        runID = args[2];
        url = args[3];
        accounts = args[4];
    } else {
        runID = process.env.RUN_ID || "";
        url = process.env.URL || "";
        accounts = process.env.ACCOUNTS || "";
        if (runID === "" || url === "" || accounts === "") {
            rootLogger.error("Please give RUN_ID, URL and ACCOUNTS env vars");
            process.exit(1);
        }
    }

    try {
        return { runID, url, accounts: JSON.parse(accounts) };
    } catch (e) {
        if (e instanceof SyntaxError) {
            rootLogger.error("Error parsing accounts", e);
            process.exit(1);
        }
        throw e;
    }
}
