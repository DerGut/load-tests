import SegfaultHandler from "segfault-handler";
import "dd-trace/init";

import { BrowserContextOptions, chromium, LaunchOptions, Logger as PWLogger } from "playwright-chromium";

import newLogger, { root as rootLogger } from "./logger";
import statsd, { CLASSES, RUNNERS } from "./statsd";
import LoadRunner, { PageMap } from "./runner";
import fs from "fs/promises";
import { PageProvider } from "./PageProvider";
import { Logger } from "winston";
import { Account, Classroom, Pupil, Teacher } from "./vus/accounts";

(async () => {
    SegfaultHandler.registerHandler();

    const { runID, url, accounts, screenshotPath, headless } = await parseArgs(process.argv);

    rootLogger.info(`Testing ${url} with ${accounts.length} classes`);
    rootLogger.info(`runID: ${runID}`);
    if (screenshotPath === "") {
        rootLogger.info("Not taking screenshot");
    }

    const pages = await startPages(headless, accounts);

    const runner = new LoadRunner(pages, runID, url, accounts, screenshotPath);
    runner.on("stopped", async () => {
        rootLogger.info("Runner has stopped.");
        statsd.decrement(RUNNERS);
        statsd.decrement(CLASSES, accounts.length);
    });
    handleSignals(runner);

    statsd.increment(RUNNERS);
    await runner.start();
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

const browserOptions: LaunchOptions = { 
    slowMo: 200,
    args: [
        "--disable-dev-shm-usage",
        "--full-memory-crash-report"
    ],
    logger: newPlaywrightLogger(rootLogger),
    handleSIGINT: false,
    handleSIGTERM: false
};

async function startPages(headless: boolean, accounts: Classroom[]): Promise<PageMap> {
    Object.assign(browserOptions, { headless });
    
    const contextOptionsProvider = (account: Account): BrowserContextOptions => {
        const logger = newLogger(account.id());
        return { logger: newPlaywrightLogger(logger) };
    };

    const provider = new PageProvider(chromium, browserOptions, contextOptionsProvider);
    return provider.provideFromContexts(accounts);
}

function newPlaywrightLogger(logger: Logger): PWLogger {
    return {
        isEnabled: () => process.env.NODE_ENV === "production",
        log: (name, _severity, message, args) => {
            if (message instanceof Error) {
                logger.error(message);
            } else {
                logger.debug(message, {name, args});
            }
        }
    };
}

function handleSignals(runner: LoadRunner) {
    process.once("SIGINT", async () => {
        rootLogger.info("Received SIGINT, stopping runner.");
        runner.on("stopped", async () => process.exit(130));
        runner.stop();
    });
    process.once("SIGTERM", async () => {
        rootLogger.info("Received SIGTERM, stopping runner.");
        runner.on("stopped", async () => process.exit(143));
        runner.stop();
    });
    process.once("exit", () => rootLogger.info("Exiting"));
}
