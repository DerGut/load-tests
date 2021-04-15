import EventEmitter from "events";
import { BrowserContext } from "playwright-chromium";
import { Logger } from "winston";
import newLogger from "../logger";
import statsd from "../statsd";

export default class VirtualUser extends EventEmitter {
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

    async run() {
        throw new Error("Abstract method");
    }

    async stop() {
        this.emit("stopping");
        this.active = false;

    }

    async think() {
        // const thinkTime = drawFromThinkTimeDistribution() * this.thinkTimeFactor;
        const rand = Math.random() + 0.5;
        const thinkTime = rand * this.thinkTimeFactor * 10 * 1000;
        return new Promise(resolve => setTimeout(resolve, thinkTime));
    }

    async time(label: string, fn: () => Promise<any>): Promise<any> {
        const intrumented = statsd.asyncDistTimer(fn, label);
        return await intrumented();
    }
}
