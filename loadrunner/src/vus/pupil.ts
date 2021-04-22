import { BrowserContext, Page } from "playwright-chromium";

import { Config } from "./config";
import VirtualUser from "./base";
import statsd, { EXERCISES_SUBMITTED, TASKSERIES_SUBMITTED } from "../statsd";
import { TaskSeries } from "./pageObjects/TaskSeries";
import { Logger } from "winston";

export default class VirtualPupil extends VirtualUser {
    account: Pupil;
    config: Config;
    constructor(logger: Logger, context: BrowserContext, account: Pupil, config: Config, screenshotPath: string) {
        super(logger, context, account.username, config.thinkTimeFactor, screenshotPath);
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
                await page.click("button:has-text('Los')");
                await this.register(page, this.account.username, this.account.password);
            });
            await this.retryRefreshing(page, async () => {
                // TODO: after refresh we need to login first?
                await this.createCompany(page, this.account.company);
            });
        } else {
            await this.retryRefreshing(page, async () => {
                await this.loginExistingAccount(page);
            });
        }

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
                // TODO: when continuing an already started task series, we need to find the 
                // most recent exercise we worked on/ the one we have feedback on
            } else {
                this.logger.info("Accepting taskseries");
                await this.time("taskseries_accept", true, async () => {
                    // TODO: double check
                    await page.click("text=Annehmen");
                    await page.waitForSelector("#taskSeries");
                });
            }

            const taskSeries = new TaskSeries(this.logger, page, this.account.username, this.time.bind(this), this.sessionActive.bind(this));
            
            let heading;
            // This is not synchronous with the server. measure it for reference
            await this.time("taskseries_heading", false, async () => {
                heading = await taskSeries.getHeading();
            });
            this.logger.info(`Started taskSeries "${heading}"`);

            while (this.sessionActive() && !(await taskSeries.finished())) {
                if (Math.random() < 0.1) {
                    this.logger.info("Sending chat message");
                    await this.sendChatMessage(page);
                }
                await this.think();
                if (!await taskSeries.canProceed()) {
                    const exercise = await taskSeries.nextExercise();
                    await exercise.work(this.thinkTimeFactor);
                    let done;
                    do {
                        await this.time("exercise_submit", true, async () => {
                            done = await exercise.submit();
                        });
                    } while (!done);
                    this.logger.info("Submitted exercise");
                    statsd.increment(EXERCISES_SUBMITTED);

                    await this.think();
                }
                await taskSeries.proceed();
                await this.think();
            }

            this.logger.info("Submitting task series");
            await this.time("taskseries_submit", true, async () => {
                await taskSeries.submit();
            });
            
            await page.click("button:has-text('OK')"); // dismiss modal
            statsd.increment(TASKSERIES_SUBMITTED);
            if (await this.investmentAvailable(page)) {
                await this.time("invest", false, async () => {
                    await this.invest(page);
                });
            }
        }
    }

    async register(page: Page, username: string, password: string) {
        const typeDelay = 200;
        await page.type("[placeholder='Benutzername']", username, { delay: typeDelay });
        await page.type("[placeholder='Passwort']:nth-of-type(1)", password, { delay: typeDelay });
        await page.type("[placeholder='Passwort wiederholen'],[placeholder='Passwort']:nth-of-type(2)", password, { delay: typeDelay });
        
        await this.time("register", true, async () => {
            await page.click("button:has-text('Bereit?')");
            await page.waitForSelector(`text='Hallo ${username}!'`);
        });
    }

    async createCompany(page: Page, name: string) {
        await page.fill(".foundCompany__input input", name);
        await this.time("company", true, async () => {
            await page.click("button:has-text('Los geht')");
            await page.waitForSelector("text='Übersicht'");
        });
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

        await this.time("login", true, async () => {
            await page.click("button:has-text('Einloggen')");
            const result = await Promise.race([
                page.waitForSelector("text='Einloggen nicht möglich! Überprüfe Benutzernamen/Email und Passwort!'"),
                page.waitForSelector("text='Aufträge'")
            ]);
            const text = await result.textContent();
            this.logger.info(text);
            if (!text || text.trim() !== "Aufträge") {
                throw new Error("Login failed");
            }
        });
        await this.think();
    }

    async investmentAvailable(page: Page): Promise<boolean> {
        const classes = await page.getAttribute("xpath=//*[contains(@class, 'office')]/..", "class");
        return classes !== null && classes.includes("-pulse");
    }

    async invest(page: Page) {
        await page.click(".office");
        await page.click(".officeSelection__button");
        await page.click("#jobs__0"); // back to tasks
    }

    async workExercise(page: Page) {
        await this.think();

        const rand = Math.random();
        console.log("random number: ", rand);
        if (rand < 0.1) {
        } else if (rand < 0.2) {
            await askQuestion(page);
        } else if (rand < 0.3) {
            await getHint(page);
        }

        async function getHint(page: Page) {
            console.log("getting hint")
            const button = await page.waitForSelector("button:has-text('Tipp')");
            if (await button.isEnabled()) {
                await button.click();
            } else {
                console.log("is not enabled...");
            }
        }

        async function askQuestion(page: Page) {
            console.log("asking question");

            await page.click(":is(button:has-text('Fragen'), button:has-text('Hilfechat'))");
            await page.fill("textarea", "qwertyuiopasdfghjkl");
            await page.click("text='Frage stellen!'");
            await page.click("text=minimieren"); // TODO: notwendig?
        }
    }

    async sendChatMessage(page: Page) {
        await page.click("a:has-text('Nachrichten')");
        await page.fill(".chat textarea", "asdfghjkl");
        await page.click(".chat button");
        await page.click("a:has-text('Nachrichten')");
        // TODO: Feedback erhalten (>gehe zur Aufgabe<) erscheint in Chat
    }
}

export async function think(time: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, time * 1000));
}
