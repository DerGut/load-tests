import { BrowserContext, Page } from "playwright-chromium";

import { Config } from "./config";
import VirtualUser from "./base";
import statsd, { EXERCISES_SUBMITTED, TASKSERIES_SUBMITTED } from "../statsd";
import { Logger } from "winston";
import { FreeText, InputField, MultipleChoice, Survey } from "./exercises";

export default class VirtualPupil extends VirtualUser {
    account: Pupil;
    config: Config;
    constructor(context: BrowserContext, account: Pupil, config: Config) {
        super(context, account.username, config.thinkTimeFactor);
        this.account = account;
        this.config = config;
    }

    async run() {
        await this.think();
        const page = await this.context.newPage();
        await this.think();
        await this.think();

        await this.retryRefreshing(page, async () => {
            this.logger.info(`Visiting ${this.config.pageUrl}`);
            await page.goto(this.config.pageUrl)
        });
        await this.think();

        await this.retryRefreshing(page, async () => {
            this.logger.info("Logging into account");
            await this.login(page);
        });

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
                this.time("taskseries_accept", async () => {
                    await page.click("text=Annehmen");
                    await page.waitForSelector("#taskSeries");
                });
            }

            const taskSeries = new TaskSeries(this.logger, page, this.time.bind(this), this.sessionActive.bind(this));
            await taskSeries.work(this.config.thinkTimeFactor);
            await page.click("button:has-text('OK')"); // dismiss modal
            statsd.increment(TASKSERIES_SUBMITTED);
            if (await this.investmentAvailable(page)) {
                // This is not synchronous with the server. measure it for reference
                await this.time("invest", async () => {
                    await this.invest(page);
                });
            }
        }
    }

    async login(page: Page) {
        if (this.config.classCode) {
            await page.fill("[placeholder=Klassencode]", this.config.classCode);
            await page.click("button:has-text('Los')");
            await this.register(page, this.account.username, this.account.password);
            await this.createCompany(page, this.account.company);
        } else {
            await this.loginExistingAccount(page);
        }
    }

    async register(page: Page, username: string, password: string) {
        const typeDelay = 200;
        await page.type("[placeholder='Benutzername']", username, { delay: typeDelay });
        await page.type("[placeholder='Passwort']:nth-of-type(1)", password, { delay: typeDelay });
        await page.type("[placeholder='Passwort wiederholen'],[placeholder='Passwort']:nth-of-type(2)", password, { delay: typeDelay });
        
        await this.time("register", async () => {
            await page.click("button:has-text('Bereit?')");
            await page.waitForSelector(`text='Hallo ${username}!'`);
        })
    }

    async createCompany(page: Page, name: string) {
        await page.fill(".foundCompany__input input", name);
        await this.time("company", async () => {
            await page.click("button:has-text('Los geht')");
            await page.waitForSelector("text='Übersicht'");
        })
    }

    async loginExistingAccount(page: Page) {
        await this.think();

        await this.time("login_click", async () => {
            await page.click("text='Einloggen'");
        });

        // type with some delay because PearUp checks asynchronously, whether the username exists
        const typeDelay = 200;
        await page.type("[placeholder='Nutzername/Email']", this.account.username, { delay: typeDelay });
        await page.type("[placeholder='Passwort']", this.account.password, { delay: typeDelay });

        await this.time("login", async () => {
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
        const office = await page.waitForSelector("xpath=//*[contains(@class, 'office')]/..");
        const classes = await office.getAttribute("class");
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
}

class TaskSeries {
    logger: Logger;
    page: Page;
    time: Function;
    sessionActive: () => boolean;
    constructor(logger: Logger, page: Page, timeFunction: Function, sessionActive: () => boolean) {
        this.logger = logger;
        this.page = page;
        this.time = timeFunction;
        this.sessionActive = sessionActive;
    }

    async work(thinkTimeFactor: number) {
        let heading;
        // This is not synchronous with the server. measure it for reference
        await this.time("taskseries_heading", async () => {
            const taskSeries = await this.page.waitForSelector("h1");
            heading = await taskSeries.innerText();
        });
        
        this.logger.info(`Started taskSeries "${heading}"`);

        while (this.sessionActive() && !await this.page.$(".taskSeries__submitButton")) {
            if (Math.random() < 0.1) {
                this.logger.info("Sending chat message");
                await this.sendChatMessage(this.page);
            }
            await think(2 * thinkTimeFactor);
            if (!await this.page.$(".proceed")) {
                const exercise = await this.nextExercise();
                if (!exercise) {
                    throw new Error("Exercise expected");
                }
                await exercise.work(thinkTimeFactor);

                let done;
                do {
                    await this.time("exercise_submit", async () => {
                        done = await exercise.submit();
                    })
                } while (!done);
                this.logger.info("Submitted exercise");
                statsd.increment(EXERCISES_SUBMITTED);

                await think(2 * thinkTimeFactor);
            }

            const next = await this.page.waitForSelector("button:has-text('Weiter')");
            await next.click();
        }

        await think(2 * thinkTimeFactor);

        this.logger.info("Submitting task series");
        await this.time("taskseries_submit", async () => {
            await this.page.click(".taskSeries__submitButton");
            await this.page.waitForSelector("text='Aufträge'");
        });
    }

    async nextExercise() {
        const next = await this.time("exercise_next", async () => {
            // TODO: wait for multiple?
            const exercises = await this.page.$$(".exercise");
            return exercises.pop();
        });
        if (!next) {
            return null;
        }
        const type = await this.time("exercise_type", async () => {
            const body = await next.waitForSelector("div > div:nth-of-type(3)");
            if (!body) {
                throw new Error("didn't find exercise body");
            }
    
            return await body.getAttribute("class");
        });

        const id = await next.getAttribute("id");
        this.logger.info(`Next exercise: ${id}`);
        
        switch (type) {
            case "freeText":
                return new FreeText(this.logger, this.page, next);
            case "survey":
                return new Survey(this.logger, this.page, next);
            case "multipleChoice":
                return new MultipleChoice(this.logger, this.page, next);
            case "input__Field":
                return new InputField(this.logger, this.page, next);
            default:
                throw new Error(`Exercise type "${type}" not implemented`);
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
