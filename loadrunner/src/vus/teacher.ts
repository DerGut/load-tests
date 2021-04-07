import { BrowserContext, Page } from "playwright-chromium";
import { Config } from "./config";
import VirtualUser from "./base";

export default class VirtualTeacher extends VirtualUser {
    account: Teacher;
    config: Config;
    constructor(context: BrowserContext, account: Teacher, config: Config) {
        super(context, account.email, config.thinkTimeFactor);
        this.account = account;
        this.config = config;
    }

    async run() {
        const page = await this.context.newPage();

        await this.think();
        await page.goto(this.config.pageUrl);

        await this.think();
        await this.login(page);
        await this.think();

        if (this.config.classLog) {
            console.log("Creating class");
            const joinCode = await this.createClass(page);
            this.config.classLog.addClass(joinCode);
            await this.think();
        }

        console.log("Doing stuff");
        while (this.sessionActive()) {
            // continue
            page.waitForTimeout(1000);
        }
    }

    async login(page: Page) { }
    async createClass(page: Page): Promise<string> { return ""; }
}
