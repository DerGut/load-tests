import { BrowserContext, errors, Page } from "playwright-chromium";
import { Config } from "./config";
import VirtualUser from "./base";
import statsd, { ERRORS } from "../statsd";

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

        let loggedIn = false;
        while (!loggedIn && this.sessionActive()) {
            try {
                this.logger.info("Logging into account");
                await this.login(page);
                loggedIn = true;
            } catch (e) {
                if (!this.sessionActive()) {
                    return;
                } else if (e instanceof errors.TimeoutError) {
                    this.logger.error("Refreshing and logging in again", e);
                    statsd.increment(ERRORS);
                    await page.reload();
                } else {
                    throw e;
                }
            }
        }

        this.logger.info("Logged in");

        await this.teach(page);
    }

    async login(page: Page) {
        if (this.config.classLog) {
            // console.log("Creating class");
            // const joinCode = await this.createClass(page);
            // this.config.classLog.addClass(joinCode);
            // await this.think();
            throw new Error("class creation not implemented yet");
        } else {
            await this.loginExistingAccount(page);
        }
    }

    async teach(page: Page) {
        let alternate = 0;
        while (this.sessionActive()) {
            try {
                await page.click("text='Unterrichten'");
                if (alternate % 2 == 0) {
                    await page.click("h4:has-text('Arbeitsplatz')");
                    await this.grade(page);
                } else {
                    await page.click("h4:has-text('Klassenraum')");
                    console.log("skip");
                }
                alternate++;
                await this.think();
                await this.think();
            } catch (e) {
                if (!this.sessionActive()) {
                    return;
                } else if (e instanceof errors.TimeoutError) {
                    this.logger.error("Refreshing and logging in again", e);
                    statsd.increment(ERRORS);
                    await page.reload();
                } else {
                    throw e;
                }
            }
        }
    }

    async grade(page: Page) {
        const next = await Promise.race([
            page.waitForSelector("#teacherWorkspaceArea"),
            page.waitForSelector("text='Gerade nichts zu tun'")
        ]);
        const text = await next?.textContent();
        if (!text?.includes("Gerade nichts zu tun")) {
            await page.fill("#teacherWorkspaceArea textarea", "abcdefghijklmnopqrstuvwxyz!!!");
            await page.click("button:has-text('Bewerten')"); // TODO: doch graden?
            await page.click("button:has-text('ja')");
        }
    }

    // TODO: move to base
    async loginExistingAccount(page: Page) {
        await this.think();

        await this.time("login_click", async () => {
            await page.click("text='Einloggen'");
        });

        // type with some delay because PearUp checks asynchronously, whether the username exists
        const typeDelay = 200;
        await page.type("[placeholder='Nutzername/Email']", this.account.email, { delay: typeDelay });
        await page.type("[placeholder='Passwort']", this.account.password, { delay: typeDelay });

        await this.time("login", async () => {
            await page.click("button:has-text('Einloggen')");
            const result = await Promise.race([
                page.waitForSelector("text='Einloggen nicht möglich! Überprüfe Benutzernamen/Email und Passwort!'"),
                page.waitForSelector("text='Home'")
            ]);
            const text = await result.textContent();
            this.logger.info(text);
            if (!text || text.trim() !== "Home") {
                throw new Error("Login failed");
            }
        });
        await this.think();
    }

    async createClass(page: Page): Promise<string> { return ""; }
}
