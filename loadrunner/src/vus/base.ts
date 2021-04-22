import EventEmitter from "events";
import { BrowserContext, errors, Page } from "playwright-chromium";
import { Logger } from "winston";
import statsd, { ERRORS } from "../statsd";

export default abstract class VirtualUser extends EventEmitter {
    logger: Logger;
    context: BrowserContext;
    thinkTimeFactor: number;
    active: boolean = true;
    id: string;
    screenshotPath: string;
    constructor(logger: Logger, browserContext: BrowserContext, id: string, thinkTimeFactor: number, screenshotPath: string) {
        super();
        this.logger = logger;
        this.context = browserContext;
        this.thinkTimeFactor = thinkTimeFactor;
        this.id = id;
        this.screenshotPath = screenshotPath;
    }

    abstract run(page: Page): Promise<void>;

    sessionActive(): boolean {
        return this.active;
    }

    async start() {
        this.emit("started");
        const page = await this.context.newPage();
        try {
            await this.run(page);
        } catch (e) {
            this.emit("failed", e);
        } finally {
            this.emit("stopped");
        }
    }

    async stop() {
        this.emit("stopping");
        this.active = false;
    }

    // Pauses for some time between 2.5s and 22.5s
    async think() {
        const rand = Math.random() + 0.5; // 0.5 to 1.5
        const thinkTime = rand * this.thinkTimeFactor * 10 * 1000;
        return new Promise(resolve => setTimeout(resolve, thinkTime));
    }

    async time<T>(label: string, sync: boolean = false, fn: () => Promise<T>): Promise<T> {
        if (sync) {
            statsd.increment("ops");
        }

        const intrumented = statsd.asyncDistTimer(fn, label);
        try {
            return await intrumented();
        } catch (e) {
            if (sync) {
                statsd.increment(ERRORS);
            }
            throw e;
        }
    }

    async retryRefreshing<T>(page: Page, fn: () => Promise<T>): Promise<T> {
        while (this.sessionActive()) {
            try {
                return await fn();
            } catch (e) {
                if (!this.sessionActive()) {
                    return Promise.reject(e);
                }
                
                if (this.screenshotPath !== "") {
                    await this.takeScreenshot(page);
                }

                if (e instanceof errors.TimeoutError) {
                    this.logger.warn("Refreshing and trying again", e);
                    await page.reload();
                } else {
                    throw e;
                }
            }
        }
        
        return Promise.reject();
    }

    async takeScreenshot(page: Page) {
        try {
            await page.screenshot({ path: this.screenshotFile(), fullPage: true });
        } catch (se) {
            this.logger.warn("Failed to take screenshot", se);
        }
    }

    screenshotFile(): string {
        return `${this.screenshotPath}/${this.id}-${new Date().toString()}.png`;
    }
}
