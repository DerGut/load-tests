import { Page } from "playwright-chromium";
import { Logger } from "winston";
import { Exercise, FreeText, InputField, MultipleChoice, Survey } from "./exercises";

type timeFunctionType = <T>(label: string, sync: boolean, fn: () => Promise<T>) => Promise<T>;

export class TaskSeries {
    logger: Logger;
    page: Page;
    pupilId: string;
    time: timeFunctionType;
    sessionActive: () => boolean;
    constructor(logger: Logger, page: Page, pupilId: string, timeFunction: timeFunctionType, sessionActive: () => boolean) {
        this.logger = logger;
        this.page = page;
        this.pupilId = pupilId;
        this.time = timeFunction;
        this.sessionActive = sessionActive;
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
        const exerciseSelector = ".subSection:nth-last-child(1) .exercise";

        const id = await this.page.getAttribute(exerciseSelector, "id");
        this.logger.info(`Next exercise: ${id}`);

        const type = await this.time("exercise_type", false, async () => {
            return await this.page.getAttribute(`${exerciseSelector} div > div:nth-of-type(3)`, "class");
        });

        this.logger.debug(`Next exercise is of type: ${type}`);

        switch (type) {
            case "freeText":
                return new FreeText(this.logger, this.page, this.pupilId);
            case "survey":
                return new Survey(this.logger, this.page, this.pupilId);
            case "multipleChoice":
                return new MultipleChoice(this.logger, this.page, this.pupilId);
            case "input__Field":
                return new InputField(this.logger, this.page, this.pupilId);
            default:
                throw new Error(`Exercise type "${type}" not implemented`);
        }
    }
}
