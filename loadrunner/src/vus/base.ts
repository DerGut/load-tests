import { BrowserContext } from "playwright-chromium";
import { Logger } from "winston";
import newLogger from "../logger";

const NS_PER_SEC = 1e9;

export default class VirtualUser {
    logger: Logger;
    context: BrowserContext;
    thinkTimeFactor: number;
    timestamp: [number, number] = [0, 0];
    active: boolean = true;
    constructor(browserContext: BrowserContext, id: string, thinkTimeFactor: number) {
        this.context = browserContext;
        this.thinkTimeFactor = thinkTimeFactor;
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
        const thinkTime = 1500;
        return new Promise(resolve => setTimeout(resolve, thinkTime));
    }

    timeStart() {
        this.timestamp = process.hrtime();
    }

    timeEnd() {
        const diff = process.hrtime(this.timestamp);
        return formatHrtime(diff);
    }
}

function formatHrtime(time: [number, number]): string {
    return `${time[0] + time[1] / NS_PER_SEC}`;
}
