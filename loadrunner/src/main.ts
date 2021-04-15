import SegfaultHandler from "segfault-handler";
import "dd-trace/init";

import { BrowserContext, chromium } from "playwright-chromium";

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
        },
        handleSIGINT: false
    });
    const contexts = (await Promise.all(
        accounts.map(createContextsForClass))
        ).flat();

    async function createContextsForClass(classroom: Classroom): Promise<BrowserContext[]> {
        const ctx = [await browser.newContext()];
        for (let i = 0; i < classroom.pupils.length; i++) {
            ctx.push(await browser.newContext());
        }
        return ctx;
    }

    const lr = new LoadRunner(contexts, runID, url, accounts);
    lr.on("stopped", async () => {
        rootLogger.info("Runner has stopped.");
        statsd.decrement(RUNNERS);
        statsd.decrement(CLASSES, accounts.length);
        await browser.close();
    });
    process.once("SIGINT", async () => {
        rootLogger.info("Received SIGINT, stopping runner.");
        lr.on("stopped", async () => process.exit(130));
        lr.stop();
    });
    process.once("exit", () => rootLogger.info("Exiting"));

    statsd.increment(RUNNERS);
    await lr.start();
    rootLogger.info(`Started all ${accounts.length * (accounts[0].pupils.length + 1)} users`);
})();

async function parseArgs(args: string[]): Promise<{ runID: string, url: string, accounts: Classroom[], headless: boolean }> {
    let runID: string, url: string, accounts: string;
    let headless: boolean = true;
    if (args.length > 2) {
        if (args.length < 5) {
            rootLogger.error("Not enough arguments provided");
            process.exit(1);
        }
        runID = args[2];
        url = args[3];
        accounts = args[4];
        if (args.length > 5 && args[5] === "false") {
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
        if (process.env.HEADLESS === "false") {
            headless = false;
        }
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
