import { chromium } from "playwright-chromium";

import LoadRunner from "./runner";

(async () => {
    const { url, accounts } = parseArgs(process.argv);

    console.log("Testing", url, "with", accounts.length, "accounts");

    const browser = await chromium.launch();

    const lr = new LoadRunner(browser, url, accounts);
    process.on("SIGINT", async () => {
        await lr.stop();
        await browser.close()
    });

    await lr.start();
    console.log("Started all", accounts.length, "users");
})();

function parseArgs(args: string[]): { url: string, accounts: Classroom[] } {
    const url = args[2];
    const accounts = JSON.parse(args[3]);
    return { url, accounts };
}
