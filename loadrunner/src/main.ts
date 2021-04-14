import SegfaultHandler from "segfault-handler";
import "dd-trace/init";

import { chromium } from "playwright-chromium";

import newLogger, { root as rootLogger } from "./logger";
import statsd, { CLASSES, RUNNERS } from "./statsd";
import LoadRunner from "./runner";
import fs from "fs/promises";

(async () => {
    SegfaultHandler.registerHandler();

    const { runID, url, accounts, headless } = await parseArgs(process.argv);

    rootLogger.info(`Testing ${url} with ${accounts.length} classes`);
    rootLogger.info(`runID: ${runID}`);

    statsd.gauge("test", 2);

    const pwLogger = newLogger("playwright");
    const browser = await chromium.launch({ 
        headless,
        slowMo: 200,
        args: [
            "--disable-dev-shm-usage",
            "--full-memory-crash-report"
        ],
        logger: {
            isEnabled: () => true,
            log: (name, severity, message, args) => {
                if (process.env.NODE_ENV !== "production") {
                    return;
                }
                if (message instanceof Error) {
                    pwLogger.error(message);
                } else {
                    pwLogger.log(severity, message, {name, args});
                }
            }
        }
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

async function parseArgs(args: string[]): Promise<{ runID: string, url: string, accounts: Classroom[], headless: boolean }> {
    let runID: string, url: string, accounts: string;
    let headless: boolean;
    if (args.length > 2) {
        if (args.length < 5) {
            rootLogger.error("Not enough arguments provided");
            process.exit(1);
        }
        runID = args[2];
        url = args[3];
        accounts = args[4];
        if (args.length > 5) {
            headless = args[5] === "true";
        } else {
            headless = false;
        }
    } else {
        runID = process.env.RUN_ID || "";
        url = process.env.URL || "";
        accounts = process.env.ACCOUNTS || "";
        if (runID === "" || url === "" || accounts === "") {
            rootLogger.error("Please give RUN_ID, URL and ACCOUNTS env vars");
            process.exit(1);
        }
        headless = process.env.HEADLESS === "true";
    }

    if (accounts.endsWith(".json")) {
        const buf = await fs.readFile(accounts);
        accounts = buf.toString();
    }

    try {
        return { runID, url, accounts: JSON.parse(accounts), headless };
    } catch (e) {
        if (e instanceof SyntaxError) {
            rootLogger.error("Error parsing accounts", e);
            process.exit(1);
        }
        throw e;
    }
}
