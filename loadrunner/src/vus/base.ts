import { BrowserContext } from "playwright-chromium";
import { Logger } from "winston";
import newLogger from "../logger";
import statsd from "../statsd";

export default class VirtualUser {
    logger: Logger;
    context: BrowserContext;
    thinkTimeFactor: number;
    timestamp: [number, number] = [0, 0];
    active: boolean = true;
    id: string;
    constructor(browserContext: BrowserContext, id: string, thinkTimeFactor: number) {
        this.context = browserContext;
        this.thinkTimeFactor = thinkTimeFactor;
        this.id = id;
        this.logger = newLogger(id);
    }

    sessionActive(): boolean {
        return this.active;
    }

    async stop() {
        // TODO: wait until run has finished
        this.active = false;

    }

    async think() {
        // const thinkTime = drawFromThinkTimeDistribution() * this.thinkTimeFactor;
        const rand = Math.random() + 0.5;
        const thinkTime = rand * this.thinkTimeFactor * 10 * 1000;
        return new Promise(resolve => setTimeout(resolve, thinkTime));
    }

    async time(label: string, fn: () => Promise<void>) {
        console.time(`${this.id}:${label}`);
        const intrumented = statsd.asyncDistTimer(fn, label);
        await intrumented();
        console.timeEnd(`${this.id}:${label}`);
    }
}
