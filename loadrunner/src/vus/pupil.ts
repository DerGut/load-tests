import { BrowserContext, ElementHandle, Page } from "playwright-chromium";

import { Config } from "./config";
import VirtualUser from "./base";

const selectors = {
    SUBMIT_TASK_SERIES: "button:has-text('Abgeben')",
    SUBMIT_EXERCISE: "button:has-text('Überprüfen')",
    FREE_TEXT: "button:has-text('Überprüfen')",
    PROCEED_EXERCISE: "button:has-text('Weiter')",
    EXERCISE_BUTTONS: ".exercise__buttons"
}

export default class VirtualPupil extends VirtualUser {
    account: Pupil;
    config: Config;
    constructor(context: BrowserContext, account: Pupil, config: Config) {
        super(context, account.username, config.thinkTimeFactor);
        this.account = account;
        this.config = config;
    }

    async run(): Promise<void> {
        await this.think();
        const page = await this.context.newPage();
        await this.think();
        await this.think();
        await page.goto(this.config.pageUrl);
        await this.think();

        if (this.config.joinCode) {
            throw new Error("class join not implemented yet");
        } else {
            this.logger.info("Logging into account");
            await this.login(page);
        }

        while (this.sessionActive()) {
            this.logger.info("Continuing doing stuff");
            await this.think();

            await this.time("accept task series", async () => {
                await page.click("text=Annehmen");
                await page.waitForSelector("#taskSeries");
            });

            const taskSeries = new TaskSeries(page, this.time);
            await taskSeries.work(this.config.thinkTimeFactor);
            await page.click("button:has-text('OK')"); // dismiss modal
            if (await this.investmentAvailable(page)) {
                await this.invest(page);
            }
        }
    }

    async login(page: Page) {
        await this.think();

        await page.click("text='Einloggen'");

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
            await sendChatMessage();
        } else if (rand < 0.2) {
            await askQuestion(page);
        } else if (rand < 0.3) {
            await getHint(page);
        }

        async function sendChatMessage() {
            console.log("Sending chat message");
            console.error("not implemented yet");
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
    page: Page;
    time: Function;
    constructor(page: Page, timeFunction: Function) {
        this.page = page;
        this.time = timeFunction;
    }

    async work(thinkTimeFactor: number) {
        const taskSeries = await this.page.waitForSelector("h1"); // ist nicht das paket sondern die exercise?
        const heading = await taskSeries.innerText();
        console.log(`Started taskSeries "${heading}"`);

        while (!await this.page.$(".taskSeries__submitButton")) {
            if (Math.random() < 0.1) {
                await this.sendChatMessage();
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
                    await this.time("submit exercise", async () => {
                        done = await exercise.submit();
                    })
                } while (!done);

                await think(2 * thinkTimeFactor);
            }

            const next = await this.page.waitForSelector(selectors.PROCEED_EXERCISE);
            await next.click();
        }

        await think(2 * thinkTimeFactor);

        await this.time("submit task series", async () => {
            await this.page.click(".taskSeries__submitButton");
            await this.page.waitForSelector("text='Aufträge'");
        });
    }

    async nextExercise() {
        const exercises = await this.page.$$(".exercise");
        const next = exercises.pop();
        if (!next) {
            return null;
        }

        const body = await next.waitForSelector("div > div:nth-of-type(3)");
        if (!body) {
            throw new Error("didn't find exercise body");
        }

        const type = await body.getAttribute("class");
        switch (type) {
            case "freeText":
                return new FreeText(next, this.page);
            case "survey":
                return new Survey(next, this.page);
            case "multipleChoice":
                return new MultipleChoice(next, this.page);
            case "input__Field":
                return new InputField(next, this.page);
            default:
                throw new Error(`Exercise type "${type}" not implemented`);
        }
    }

    async sendChatMessage() {

    }
}


class Exercise {
    page: Page;
    handle: ElementHandle;
    avgWorkDurationSec: number = -1;
    constructor(exerciseHandle: ElementHandle, page: Page) {
        this.page = page;
        this.handle = exerciseHandle;
    }

    // Waits between (avgWorkDurationSec/4) and (6*avgWorkDurationSec/4)
    async think(thinkTimeFactor: number) {
        const rand = Math.random() + 0.5;
        const thinkTime = thinkTimeFactor * rand * this.avgWorkDurationSec;
        console.log(`thinking ${thinkTime}sec`);
        await think(thinkTime / 10);
    }

    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
    }

    async submit(): Promise<boolean> { throw new Error("Abstract") }

    async maybeDismissWrongAnswerModal() {
        await think(2);
        const wrongAnswerModal = await this.page.$("button:has-text('OK')");
        if (wrongAnswerModal) {
            await wrongAnswerModal.click(); // dismiss
        }
    }

    async evaluation(): Promise<boolean> {
        const evaluation = await Promise.race([
            this.page.waitForSelector("svg.success__checkmark").catch(), // correct answer
            this.page.waitForSelector(".ppSwal").catch(), // wrong answer, modal
            this.page.waitForSelector(".exerciseHints").catch(), // wrong answer, hints displayed
        ]);

        const classes = await evaluation.getAttribute("class");
        if (!classes) {
            throw new Error("Wrong element");
        } else if (classes.includes("success__checkmark")) {
            return true;
        } else if (classes.includes("ppSwal")) {
            await this.page.click("button:has-text('OK')");
            return true;
        } else if (classes.includes("exerciseHints")) {
            return false;
        } else {
            throw new Error(`Unknown evaluation: ${classes}`);
        }
    }
}

class FreeText extends Exercise {
    avgWorkDurationSec = 300;
    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        const input = await this.handle.waitForSelector(".ql-editor");
        await input.fill("abcdefghijklmnopqrstuvwxyz");
    }
    async submit(): Promise<boolean> {
        const submit = await this.handle.waitForSelector("button:has-text('Abgeben')");
        await submit.click();
        return true;
    }
}

class Survey extends Exercise {
    avgWorkDurationSec = 60;
    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        const div = await this.handle.waitForSelector(".survey > div");
        const subType = await div.getAttribute("class");
        switch (subType) {
            case "multipleChoice": // with hint and 
                const choice = await div.waitForSelector(".checkboxesContainer");
                await choice.click();
                break;
            case "rangeSlider": // with hint and question
                const rangeSlider = await this.handle.waitForSelector("input");
                await rangeSlider.evaluate((elem) => elem.stepUp()); // change value
                await rangeSlider.dispatchEvent("change");
                break;
            default:
                throw new Error(`Unknown subtype for Survey exercise: ${subType}`);
        }
    }

    async submit(): Promise<boolean> {
        const submit = await this.handle.waitForSelector("button:has-text('Abstimmen')");
        await submit.click();
        return true;
    }
}

class MultipleChoice extends Exercise {
    avgWorkDurationSec = 60;

    async submit(): Promise<boolean> {
        const submit = await this.handle.waitForSelector("button:has-text('Überprüfen')");
        await submit.click();

        return await this.evaluation();
    }
}

class InputField extends Exercise {
    avgWorkDurationSec = 20;

    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        const input = await this.handle.waitForSelector("#input");
        await input.fill("1");
    }

    async submit() {
        const submit = await this.handle.waitForSelector("button:has-text('Überprüfen')");
        await submit.click();

        return await this.evaluation();
    }
}

async function think(time: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, time * 1000));
}
