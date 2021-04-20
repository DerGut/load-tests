import EventEmitter from "events";
import { BrowserContext, errors, Page } from "playwright-chromium";
import { Logger } from "winston";
import newLogger from "../logger";
import statsd, { ERRORS } from "../statsd";

export default abstract class VirtualUser extends EventEmitter {
    logger: Logger;
    context: BrowserContext;
    thinkTimeFactor: number;
    timestamp: [number, number] = [0, 0];
    active: boolean = true;
    id: string;
    constructor(browserContext: BrowserContext, id: string, thinkTimeFactor: number) {
        super();
        this.context = browserContext;
        this.thinkTimeFactor = thinkTimeFactor;
        this.id = id;
        this.logger = newLogger(id);
    }

    abstract run(): Promise<void>;

    sessionActive(): boolean {
        return this.active;
    }

    async start() {
        this.emit("started");
        try {
            await this.run();
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

    async time(label: string, fn: () => Promise<any>): Promise<any> {
        const intrumented = statsd.asyncDistTimer(fn, label);
        return await intrumented();
    }

    async retryRefreshing<T>(page: Page, fn: () => Promise<T>): Promise<T> {
        while (this.sessionActive()) {
            try {
                return await fn();
            } catch (e) {
                if (!this.sessionActive()) {
                    return Promise.reject(e);
                } else if (e instanceof errors.TimeoutError) {
                    this.logger.error("Refreshing and trying again", e);
                    statsd.increment(ERRORS);
                    await page.reload();
                } else {
                    throw e;
                }
            }
        }
        
        return Promise.reject();
    }
}
