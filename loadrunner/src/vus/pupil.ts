import { BrowserContext, Page } from "playwright-chromium";

import { Config } from "./config";
import VirtualUser from "./base";

export default class VirtualPupil extends VirtualUser {
    account: Pupil;
    config: Config;
    constructor(context: BrowserContext, account: Pupil, config: Config) {
        super(context, config.thinkTimeFactor);
        this.account = account;
        this.config = config;
    }

    async run() {
        const page = await this.context.newPage();
        await this.think();
        await page.goto(this.config.pageUrl);
        await this.think();

        if (this.config.joinCode) {
            console.log("Joining class");
            await this.join(page);
        } else {
            console.log("Logging into account");
            await this.login(page);
        }

        while (this.sessionActive()) {
            console.log("Continuing doing stuff");
            await this.think();
            await this.workTaskSeries(page);
        }
    }

    async login(page: Page) { }

    async join(page: Page) { }

    async workTaskSeries(page: Page) { }

}
