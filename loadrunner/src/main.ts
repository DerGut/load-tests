import { chromium } from "playwright-chromium";
import { root as rootLogger } from "./logger";

import LoadRunner from "./runner";

(async () => {
    const { runID, url, accounts } = parseArgs(process.argv);

    rootLogger.info(`Testing ${url} with ${accounts.length} accounts`);
    rootLogger.info(`runID: ${runID}`);

    const browser = await chromium.launch({ headless: true, slowMo: 200 });

    const lr = new LoadRunner(browser, runID, url, accounts);
    process.on("SIGINT", async () => {
        rootLogger.info("Received SIGINT");
        await browser.close()
    });

    await lr.start();
    rootLogger.info(`Started all ${accounts.length} users`);
})();

function parseArgs(args: string[]): { runID: string, url: string, accounts: Classroom[] } {
    if (args.length < 4) {
        rootLogger.error("Not enough arguments provided");
        process.exit(1);
    }
    const runID = args[2];
    const url = args[3];
    try {
        const accounts = JSON.parse(args[4]);
        return { runID, url, accounts };
    } catch (e) {
        if (e instanceof SyntaxError) {
            rootLogger.error("Error parsing accounts");
            process.exit(1);
        }
        throw e;
    }

}
