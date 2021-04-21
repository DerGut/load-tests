import { ElementHandle, Page } from "playwright-chromium";
import { Logger } from "winston";
import { think } from "../pupil";

export abstract class Exercise {
    logger: Logger;
    page: Page;
    pupilId: string;
    index: number;
    avgWorkDurationSec: number = -1;
    constructor(logger: Logger, page: Page, pupilId: string, index: number) {
        this.logger = logger;
        this.page = page;
        this.pupilId = pupilId;
        this.index = index;
    }

    abstract submit(): Promise<boolean>;

    selector(selector: string): string {
        return `.exercise:nth-of-type(${this.index}) ${selector}`;
    }

    // Waits between (avgWorkDurationSec/4) and (6*avgWorkDurationSec/4)
    async think(thinkTimeFactor: number) {
        const rand = Math.random() + 0.5;
        const thinkTime = thinkTimeFactor * rand * this.avgWorkDurationSec;
        this.logger.info(`thinking ${thinkTime}sec`);
        await think(thinkTime);
    }

    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
    }

    async maybeDismissWrongAnswerModal() {
        await think(2);
        try {
            const wrongAnswerModal = await this.page.waitForSelector("button:has-text('OK')", { timeout: 1 });    
            await wrongAnswerModal?.click();
        } catch {}
    }

    async evaluation(): Promise<boolean> {
        const evaluation = await Promise.race([
            this.page.waitForSelector("svg.success__checkmark").catch(),
            this.page.waitForSelector(".ppSwal").catch(),
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

    async getHint() {
        console.log("getting hint");
        const button = await this.page.waitForSelector(this.selector("button:has-text('Tipp')"));
        if (await button.isEnabled()) {
            await button.click();
        } else {
            console.log("is not enabled...");
        }
    }

    async requestHelp() {
        console.log("Requesting help");
        const questionButton = await this.page.waitForSelector(this.selector("button:has-text('Fragen')"));
        await questionButton.click();
        await this.page.fill("textarea", "qwertyuiopasdfghjkl");
        await this.page.click("text='Frage stellen!'");
        // const minimize = await this.handle.waitForSelector("text=minimieren");
        // await minimize.click();
    }
}

export class FreeText extends Exercise {
    avgWorkDurationSec = 300;
    async work(thinkTimeFactor: number) {
        if (Math.random() < 0.3) {
            await this.requestHelp();
        }
        await this.think(thinkTimeFactor);
        const input = await this.page.waitForSelector(this.selector(".ql-editor"));
        await input.fill("abcdefghijklmnopqrstuvwxyz");
    }
    
    async submit(): Promise<boolean> {
        const submit = await this.page.waitForSelector(this.selector("button:has-text('Abgeben')"));
        await submit.click();
        return true;
    }
}

export class Survey extends Exercise {
    avgWorkDurationSec = 60;
    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        if (Math.random() < 0.2) {
            await this.requestHelp();
        }

        const div = await this.page.waitForSelector(this.selector(".survey > div"));
        const subType = await div.getAttribute("class");
        switch (subType) {
            case "multipleChoice": // with hint and 
                const choice = await div.waitForSelector(".checkboxesContainer");
                await choice.click();
                break;
            case "rangeSlider": // with hint and question
                const rangeSlider = await this.page.waitForSelector(this.selector("input"));
                await rangeSlider.evaluate((elem) => elem.stepUp()); // change value
                await rangeSlider.dispatchEvent("change");
                break;
            default:
                throw new Error(`Unknown subtype for Survey exercise: ${subType}`);
        }
    }

    async submit(): Promise<boolean> {
        const submit = await this.page.waitForSelector(this.selector("button:has-text('Abstimmen')"));
        await submit.click();
        return true;
    }
}

export class MultipleChoice extends Exercise {
    avgWorkDurationSec = 60;

    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        if (Math.random() < 0.2) {
            await this.requestHelp();
        }
    }

    async submit(): Promise<boolean> {
        try {
            // TODO: double check
            const submit = await this.page.waitForSelector(this.selector("button:has-text('Überprüfen')"));
            await submit.click();
        } catch (e) {
            await this.page.screenshot({ path: `/home/pwuser/runner/errors/${this.pupilId}.png`, fullPage: true });
            throw e;
        }

        return await this.evaluation();
    }
}

export class InputField extends Exercise {
    avgWorkDurationSec = 20;

    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        const input = await this.page.waitForSelector(this.selector("#input"));
        await input.fill("1");
    }

    async submit() {
        const submit = await this.page.waitForSelector(this.selector("button:has-text('Überprüfen')"));
        await submit.click();

        return await this.evaluation();
    }
}
