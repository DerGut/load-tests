import { Page } from "playwright-chromium";
import { Logger } from "winston";
import { think } from "../pupil";

export abstract class Exercise {
    logger: Logger;
    page: Page;
    pupilId: string;

    // This number includes the time spent for reading a text, watching a video etc. before
    // starting the actual exercise. So these should be big. -1 because this class is abstract.
    avgWorkDurationMin: number = -1;
    constructor(logger: Logger, page: Page, pupilId: string) {
        this.logger = logger;
        this.page = page;
        this.pupilId = pupilId;
    }

    abstract submit(): Promise<boolean>;

    selector(selector: string): string {
        return `.subSection:nth-last-child(1) .exercise ${selector}`;
    }

    // Waits between (avgWorkDurationSec/4) and (6*avgWorkDurationSec/4)
    async think(thinkTimeFactor: number) {
        const rand = Math.random() + 0.5;
        const thinkTimeSec = thinkTimeFactor * rand * this.avgWorkDurationMin * 60;
        this.logger.info(`thinking ${thinkTimeSec}sec`);
        await think(thinkTimeSec);
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
        const evaluation = await this.page.waitForSelector(":is(svg.success__checkmark, .ppSwal)");

        const classes = await evaluation.getAttribute("class");
        if (!classes) {
            throw new Error("Wrong element");
        } else if (classes.includes("success__checkmark")) {
            this.logger.debug("Success");
            return true;
        } else if (classes.includes("ppSwal")) {
            this.logger.debug("Modal, dismissing");
            await this.page.click("button:has-text('OK')");
            return true;
        } else {
            throw new Error(`Unknown evaluation: ${classes}`);
        }
    }

    async hasHint(): Promise<boolean> {
        await this.page.waitForSelector(this.selector(".exercise__hintButton"));
        return !await this.page.$(this.selector(".exercise__hintButton.-disabled"));
    }

    async getHint() {
        this.logger.info("getting hint");
        await this.page.click(this.selector("button.exercise__hintButton"));
    }

    async requestHelp() {
        this.logger.info("Requesting help");
        await this.page.click(this.selector("button:has-text('Fragen')"));
        await this.page.fill("textarea", "qwertyuiopasdfghjkl");
        await this.page.click("text='Frage stellen!'");
        // await this.page.click(this.selector("'text=minimieren'"));
    }
}

export class FreeText extends Exercise {
    avgWorkDurationMin = 15;
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
    avgWorkDurationMin = 5;
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
                await this.page.$eval(this.selector("input"), (elem, value) => {
                    // React tracks the value property and stops the change event 
                    // from propagating. It is therefore necessary to set the value 
                    // of the underlying native DOM element. 
                    setNativeValue(elem, value);

                    // @ts-ignore
                    elem.dispatchEvent(new Event("input", { "bubbles": true }));
                    // @ts-ignore
                    elem.dispatchEvent(new Event("change", { "bubbles": true }));

                    // @ts-ignore
                    function setNativeValue(element, value) {
                        const {set: valueSetter} =
                          Object.getOwnPropertyDescriptor(element, 'value') || {};
                        const prototype = Object.getPrototypeOf(element);
                        const {set: prototypeValueSetter} =
                          Object.getOwnPropertyDescriptor(prototype, 'value') || {};
                      
                        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
                          prototypeValueSetter.call(element, value);
                        } else if (valueSetter) {
                          valueSetter.call(element, value);
                        } else {
                          throw new Error('The given element does not have a value setter');
                        }
                      }
                }, "70");
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
    avgWorkDurationMin = 5;

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
    avgWorkDurationMin = 60;

    async work(thinkTimeFactor: number) {
        await this.think(thinkTimeFactor);
        await this.page.fill(this.selector("#input"), "1");
    }

    async submit() {
        await this.page.click(this.selector("button:has-text('Überprüfen')"));

        return await this.evaluation();
    }
}
