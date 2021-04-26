import { Page } from "playwright-chromium";

import { Config } from "./config";
import VirtualUser from "./base";
import statsd, { EXERCISES_SUBMITTED, TASKSERIES_SUBMITTED } from "../statsd";
import { TaskSeries } from "./pageObjects/TaskSeries";
import { Logger } from "winston";
import { Pupil } from "./accounts";

export default class VirtualPupil extends VirtualUser {
    account: Pupil;
    config: Config;
    constructor(logger: Logger, page: Page, account: Pupil, config: Config, screenshotPath: string) {
        super(logger, page, account.id(), config.thinkTimeFactor, screenshotPath, {
            pupil: account.username,
            class: account.username.replace("pupil", "").replace(/t\d/, "")
        });
        this.account = account;
        this.config = config;
    }

    async run(page: Page) {
        await this.think();
        await this.think();

        await this.retryRefreshing(page, async () => {
            this.logger.info(`Visiting ${this.config.pageUrl}`);
            await page.goto(this.config.pageUrl)
        });
        await this.think();

        const classCode = this.config.classCode;
        if (classCode) {
            await this.retryRefreshing(page, async () => {
                this.logger.info("Logging into account");
                await page.fill("[placeholder=Klassencode]", classCode);
                await this.think();
                await page.click("button:has-text('Los')");
                await this.register(page, this.account.username, this.account.password);
            });
            await this.think();
            await this.retryRefreshing(page, async () => {
                // TODO: after refresh we need to login first?
                await this.createCompany(page, this.account.company);
            });
        } else {
            await this.retryRefreshing(page, async () => {
                await this.loginExistingAccount(page);
            });
        }

        await this.think();
        await this.think();

        await this.retryRefreshing(page, async () => {
            this.logger.info("Starting to play");
            await this.play(page);
        });
    }

    async play(page: Page) {
        while (this.sessionActive()) {
            await this.think();

            if (await page.$("button:has-text('Zum Arbeitsplatz')")) {
                this.logger.info("Back to workplace");
                await page.click("button:has-text('Zum Arbeitsplatz')");
            } else {
                this.logger.info("Accepting taskseries");
                await this.time("taskseries_accept", true, async () => {
                    // TODO: double check
                    await page.click("text=Annehmen");
                    await page.waitForSelector(":is(#taskSeries, .revision)");
                });
            }

            // This is not synchronous with the server. measure it for reference
            const heading = await this.time("taskseries_heading", false, async () => {
                return await page.innerText("h1");
            });

            this.logger.info(`Started taskSeries "${heading}"`);
            const taskSeries = new TaskSeries(this.logger, page, this.account.username, this.time.bind(this), this.sessionActive.bind(this));

            while (this.sessionActive() && !(await taskSeries.finished())) {
                await this.think();

                if (Math.random() < 0.1) {
                    this.logger.info("Sending chat message");
                    await this.sendChatMessage(page);
                }
                await this.think();
                if (!await taskSeries.canProceed()) {
                    const exercise = await taskSeries.nextExercise();
                    await exercise.work(this.thinkTimeFactor);

                    while (await exercise.hasHint()) {
                        await this.think();
                        await this.time("exercise_hint", true, async () => {
                            await exercise.getHint();
                        });
                    }

                    let done;
                    do {
                        await this.think();
                        // Because we don't actually solve any of the exercises but try to submit
                        // an empty 'solution', we sometimes need to hit submit multiple times to 
                        // dismiss hints, warnings, etc.
                        await this.time("exercise_submit", true, async () => {
                            done = await exercise.submit();
                        });
                    } while (!done);
                    this.logger.info("Submitted exercise");
                    statsd.increment(EXERCISES_SUBMITTED, this.tags);

                    await this.think();
                }
                await taskSeries.proceed();
                await this.think();
            }

            await this.think();

            this.logger.info("Submitting task series");
            await this.time("taskseries_submit", true, async () => {
                await taskSeries.submit();
            });
            
            await page.click("button:has-text('OK')"); // dismiss modal
            statsd.increment(TASKSERIES_SUBMITTED, this.tags);
            if (await this.investmentAvailable(page)) {
                await this.think();
                await this.think();
                await this.invest(page);
            }
        }
    }

    async register(page: Page, username: string, password: string) {
        const typeDelay = 200;
        await page.type("[placeholder='Benutzername']", username, { delay: typeDelay });
        await this.think();
        await page.type("[placeholder='Passwort']:nth-of-type(1)", password, { delay: typeDelay });
        await this.think();
        await page.type("[placeholder='Passwort wiederholen'],[placeholder='Passwort']:nth-of-type(2)", password, { delay: typeDelay });
        await this.think();
        
        await this.time("register_pupil", true, async () => {
            await page.click("button:has-text('Bereit?')");
            await page.waitForSelector(`text='Hallo ${username}!'`);
        });
    }

    async createCompany(page: Page, name: string) {
        await this.think();
        this.logger.debug(`Creating new company: ${name}`);
        await this.recordPage(page);
        await page.click(".foundCompany__input input");
        await page.type(".foundCompany__input input", name, { delay: 200 });
        await this.recordPage(page);
        await this.think();
        await this.time("company", true, async () => {
            await page.click("button:has-text('Los geht')", { force: true });
            await page.waitForSelector("text='Übersicht'");
        });
        await this.recordPage(page);
    }

    async loginExistingAccount(page: Page) {
        await this.think();

        await this.time("login_click", false, async () => {
            await page.click("text='Einloggen'");
        });

        // type with some delay because PearUp checks asynchronously, whether the username exists
        const typeDelay = 200;
        await page.type("[placeholder='Nutzername/Email']", this.account.username, { delay: typeDelay });
        await page.type("[placeholder='Passwort']", this.account.password, { delay: typeDelay });

        await this.think();

        await this.time("login_pupil", true, async () => {
            await page.click("button:has-text('Einloggen')");
            await page.waitForSelector("text='Aufträge'");
        });
        await this.think();
    }

    async investmentAvailable(page: Page): Promise<boolean> {
        const classes = await page.getAttribute("xpath=//*[contains(@class, 'office')]/..", "class");
        return classes !== null && classes.includes("-pulse");
    }

    async invest(page: Page) {
        await this.think();
        await page.click(".office");
        await this.think();
        await this.think();
        await this.think();
        await this.think();
        this.time("invest", false, async () => {
            await page.click(".officeSelection__button");
            await page.click("#jobs__0"); // back to tasks
            await page.waitForSelector("text='Aufträge'");
        });
    }

    async sendChatMessage(page: Page) {
        await page.click("a:has-text('Nachrichten')");
        await this.think();
        await page.fill(".chat textarea", "asdfghjkl");
        await page.click(".chat button.-green");
        await this.think();
        await page.click("a:has-text('Nachrichten')");
    }
}
