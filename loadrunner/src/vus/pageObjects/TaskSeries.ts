import { Page } from "playwright-chromium";
import statsd, { EXERCISES_SUBMITTED } from "../../statsd";
import { Logger } from "winston";
import { FreeText, InputField, MultipleChoice, Survey } from "./exercises";
import { think } from "../pupil";

export class TaskSeries {
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
                    });
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
