import { Page } from "playwright-chromium";
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
        return `:nth-match(.exercise, ${this.index}) ${selector}`;
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
            await this.page.click("button:has-text('OK')", { timeout: 1 });
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
        await this.page.click(this.selector("button:has-text('Fragen')"));
        await this.page.fill("textarea", "qwertyuiopasdfghjkl");
        await this.page.click("text='Frage stellen!'");
        // await this.page.click(this.selector("text=minimieren"));
    }
}

export class FreeText extends Exercise {
    avgWorkDurationSec = 300;
    async work(thinkTimeFactor: number) {
        if (Math.random() < 0.3) {
            await this.requestHelp();
        }
        await this.think(thinkTimeFactor);
        await this.page.fill(this.selector(".ql-editor"), "abcdefghijklmnopqrstuvwxyz");
    }
    
    async submit(): Promise<boolean> {
        await this.page.click(this.selector("button:has-text('Abgeben')"));
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

        const divSelector = this.selector(".survey > div");
        const subType = await this.page.getAttribute(divSelector, "class");
        switch (subType) {
            case "multipleChoice": // with hint and 
                await this.page.click(`${divSelector} .checkboxesContainer`);
                break;
            case "rangeSlider": // with hint and question
                const input = await this.page.waitForSelector(this.selector("input"));
                const source = await input.boundingBox();
                if (!source) {
                    throw new Error("Input bounding box expected");
                }
                await this.page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
                await this.page.mouse.down();
                await this.page.mouse.move(source.x + source.width / 3, source.y + source.height / 2);
                await this.page.mouse.up();
                break;
            default:
                throw new Error(`Unknown subtype for Survey exercise: ${subType}`);
        }
    }

    async submit(): Promise<boolean> {
        await this.page.click(this.selector("button:has-text('Abstimmen')"));
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
        // TODO: double check
        await this.page.click(this.selector("button:has-text('Überprüfen')"));

        return await this.evaluation();
    }
}

export class InputField extends Exercise {
    avgWorkDurationSec = 20;

    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        await this.page.fill(this.selector("#input"), "1");
    }

    async submit() {
        await this.page.click(this.selector("button:has-text('Überprüfen')"));

        return await this.evaluation();
    }
}
