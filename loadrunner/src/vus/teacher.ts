import { BrowserContext, Page } from "playwright-chromium";
import { Config } from "./config";
import VirtualUser from "./base";
import { Logger } from "winston";

export default class VirtualTeacher extends VirtualUser {
    account: Teacher;
    config: Config;
    constructor(logger: Logger, context: BrowserContext, account: Teacher, config: Config, screenshotPath: string) {
        super(logger, context, account.email, config.thinkTimeFactor, screenshotPath);
        if (config.classSize && (config.classSize < 2 || config.classSize > 40)) {
            throw new Error("Class size needs to be between 2 and 40 (inclusive)");
        }
        this.account = account;
        this.config = config;
    }

    async run(page: Page) {
        await this.think();
        await page.goto(this.config.pageUrl);

        if (this.config.classLog) {
            await this.retryRefreshing(page, async () => {
                this.logger.info("Signing up");
                await this.signUp(page, this.account.email, this.account.password);
            });
        }

        // Teacher currently also needs to login after signup due to a bug https://github.com/ohmeingott/PearUp/issues/3806
        // The bug has been fixed but I don't want to update the branch at this point.
        await this.retryRefreshing(page, async () => {
            this.logger.info("Logging into account");
            await this.loginExistingAccount(page, this.account.email, this.account.password);
        });

        if (this.config.classLog) {
            if (!this.config.className || !this.config.classSize) {
                throw new Error("className and classSize should be provided for new class creation");
            }
            this.logger.info("Creating class");
            const classCode = await this.createClass(page, this.config.className, this.config.classSize);
            this.config.classLog.addClass(classCode);

            await this.addUnits(page);
        }
        
        while (this.sessionActive()) {
            await this.teach(page);
        }
    }

    async teach(page: Page) {
        let alternate = 0;
        await this.retryRefreshing(page, async () => {
            await page.click("text='Unterrichten'");
            if (alternate % 2 == 0) {
                await page.click("h4:has-text('Arbeitsplatz')");
                await page.waitForSelector("#teacher__workspaceContainer")
                if (!await page.$("text='Gerade nichts zu tun'")) {
                    await this.grade(page);
                }
            } else {
                await page.click("h4:has-text('Klassenraum')");
            }
            alternate++;
            await this.think();
            await this.think();
        });
    }

    async signUp(page: Page, email: string, password: string) {
        await page.click("button:has-text('Registrieren')");
        await page.click("text='als Lehrer:in'");
        const typeDelay = 100;
        await page.type("[placeholder='Email']", email, { delay: typeDelay });
        await page.type("[placeholder='Passwort']", password, { delay: typeDelay });
        await page.type("[placeholder='Passwort wiederholen']", password, { delay: typeDelay });
        await page.click("label.checkbox:nth-of-type(2)");
        await page.click("#skipDsgvoButton");
        await page.click("#acceptDsgvoButton");

        await page.click("button:has-text('Bereit?')");

        await this.solveCaptcha(page);
    }

    async solveCaptcha(page: Page) {
        const haveFun = await page.waitForSelector("[data-id=haveFun]");
        const source = await haveFun.boundingBox();
        if (!source) {
            throw new Error();
        }
        const whilePlaying = await page.waitForSelector("[data-id=whilePlaying]");
        const target = await whilePlaying.boundingBox();
        if (!target) {
            throw new Error();
        }
        await page.mouse.move(source?.x + source?.width / 2, source?.y + source?.height / 2);
        await page.mouse.down();
        await page.mouse.move(target?.x + target?.width / 2, target?.y + target?.height / 2);
        await page.mouse.up();
    }

    async grade(page: Page) {
        // Click on exercise to grade in case help requests are open (we don't want those)
        await page.click(".exercise__name");

        this.logger.info("Grading exercise");
        await page.fill("#teacherWorkspaceArea textarea", "abcdefghijklmnopqrstuvwxyz!!!");
        await page.click("button:has-text('Bewerten')"); // TODO: doch graden?
        await page.click("button:has-text('ja')");
    }

    // TODO: move to base
    async loginExistingAccount(page: Page, email: string, password: string) {
        await this.think();

        await this.time("login_click", false, async () => {
            await page.click("text='Einloggen'");
        });

        // type with some delay because PearUp checks asynchronously, whether the username exists
        const typeDelay = 100;
        await page.type("[placeholder='Nutzername/Email']", email, { delay: typeDelay });
        await page.type("[placeholder='Passwort']", password, { delay: typeDelay });

        await this.time("login", true, async () => {
            await page.click("button:has-text('Einloggen')");
            await page.waitForSelector("text='Home'");
        });
        await this.think();
    }

    async createClass(page: Page, name: string, size: number): Promise<string> { 
        await page.click('button:has-text("Klasse erstellen")');

        await page.fill("[placeholder='Klassenname']", name);
        await page.click("div[name=grade]");
        await page.click("div[name=grade] [role=option]:has-text('6')");
        await page.click("div[name=count]");
        await page.click(`div[name=count] [role=option]:has-text('${size}')`);

        await page.click("button[type=submit]");

        const code = await page.textContent(".classCode h1");
        if (!code) {
            throw new Error("No class code found");
        }
        
        return code.trim();
    }

    async addUnits(page: Page) {
        await page.click(".customDropdown:has-text('Vorbereiten')");
        await page.click("h4:has-text('Material')");

        const units = ["aiImpact", "aiIntro", "mlIntro", "mlPrincipals"];
        for (let i = 0; i < units.length; i++) {
            await page.click(`#${units[i]}`);
            await page.click("button:has-text('Zur Klasse hinzufügen')");
            await this.think();
            await this.think();
        }

        await page.click("a:has-text('Home')");
    }
}
