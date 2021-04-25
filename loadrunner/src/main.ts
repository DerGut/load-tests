import SegfaultHandler from "segfault-handler";
import "dd-trace/init";

import { LaunchOptions } from "playwright-chromium";

import { root as rootLogger } from "./logger";
import statsd, { CLASSES, RUNNERS } from "./statsd";
import LoadRunner from "./runner";
import fs from "fs/promises";
import { BrowserProvider } from "./browser";

(async () => {
    SegfaultHandler.registerHandler();

    const { runID, url, accounts, screenshotPath, headless } = await parseArgs(process.argv);

    rootLogger.info(`Testing ${url} with ${accounts.length} classes`);
    rootLogger.info(`runID: ${runID}`);
    if (screenshotPath === "") {
        rootLogger.info("Not taking screenshot");
    }

    const browserConfig: LaunchOptions = { 
        headless,
        slowMo: 200,
        args: [
            "--disable-dev-shm-usage",
            "--full-memory-crash-report"
        ],
        logger: {
            isEnabled: () => process.env.NODE_ENV === "production",
            log: (name, _severity, message, args) => {
                if (message instanceof Error) {
                    rootLogger.error(message);
                } else {
                    rootLogger.debug(message, {name, args});
                }
            }
        },
        handleSIGINT: false,
        handleSIGTERM: false
    };

    const pages = await new BrowserProvider(browserConfig)
        .initializePages(accounts);

    const lr = new LoadRunner(pages, runID, url, accounts, screenshotPath);
    lr.on("stopped", async () => {
        rootLogger.info("Runner has stopped.");
        statsd.decrement(RUNNERS);
        statsd.decrement(CLASSES, accounts.length);
    });
    process.once("SIGINT", async () => {
        rootLogger.info("Received SIGINT, stopping runner.");
        lr.on("stopped", async () => process.exit(130));
        lr.stop();
    });
    process.once("SIGTERM", async () => {
        rootLogger.info("Received SIGTERM, stopping runner.");
        lr.on("stopped", async () => process.exit(143));
        lr.stop();
    });
    process.once("exit", () => rootLogger.info("Exiting"));

    statsd.increment(RUNNERS);
    await lr.start();
    rootLogger.info(`Started all ${accounts.length * (accounts[0].pupils.length + 1)} users`);
})();

type ConfigType = { runID: string, url: string, accounts: Classroom[], screenshotPath: string, headless: boolean };

async function parseArgs(args: string[]): Promise<ConfigType> {
    let runID: string, url: string, accounts: string;
    let screenshotPath: string = "";
    let headless: boolean = true;
    if (args.length > 2) {
        if (args.length < 5) {
            rootLogger.error("Not enough arguments provided");
            process.exit(1);
        }
        runID = args[2];
        url = args[3];
        accounts = args[4];
        if (args.length > 5) {
            screenshotPath = args[5];
        }
        if (args.length > 6 && args[6] === "false") {
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
        screenshotPath = process.env.SCREENSHOT_PATH || "";
        if (process.env.HEADLESS === "false") {
            headless = false;
        }
    }

    if (accounts.endsWith(".json")) {
        const buf = await fs.readFile(accounts);
        accounts = buf.toString();
    }

    try {
        return { runID, url, accounts: JSON.parse(accounts), screenshotPath, headless };
    } catch (e) {
        if (e instanceof SyntaxError) {
            rootLogger.error("Error parsing accounts", e);
            process.exit(1);
        }
        throw e;
    }
}
