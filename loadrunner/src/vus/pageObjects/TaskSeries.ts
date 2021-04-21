import { Page } from "playwright-chromium";
import { Logger } from "winston";
import { Exercise, FreeText, InputField, MultipleChoice, Survey } from "./exercises";

export class TaskSeries {
    logger: Logger;
    page: Page;
    pupilId: string;
    time: Function;
    sessionActive: () => boolean;
    constructor(logger: Logger, page: Page, pupilId: string, timeFunction: Function, sessionActive: () => boolean) {
        this.logger = logger;
        this.page = page;
        this.pupilId = pupilId;
        this.time = timeFunction;
        this.sessionActive = sessionActive;
    }

    async getHeading(): Promise<string> {
        return await this.page.innerText("h1");
    }

    async finished(): Promise<boolean> {
        return !!await this.page.$(".taskSeries__submitButton");
    }

    async canProceed(): Promise<boolean> {
        return !!await this.page.$(".proceed");
    }

    async proceed() {
        await this.page.click("button:has-text('Weiter')");
    }

    async submit() {
        await this.page.click(".taskSeries__submitButton");
        await this.page.waitForSelector("text='Aufträge'");
    }

    async nextExercise(): Promise<Exercise> {
        const next = await this.time("exercise_next", async () => {
            await this.page.waitForSelector(".exercise");
            const exercises = await this.page.$$(".exercise");
            return exercises.pop();
        });
        if (!next) {
            throw new Error("Exercise expected");
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
                return new FreeText(this.logger, this.page, this.pupilId, next);
            case "survey":
                return new Survey(this.logger, this.page, this.pupilId, next);
            case "multipleChoice":
                return new MultipleChoice(this.logger, this.page, this.pupilId, next);
            case "input__Field":
                return new InputField(this.logger, this.page, this.pupilId, next);
            default:
                throw new Error(`Exercise type "${type}" not implemented`);
        }
    }
}
