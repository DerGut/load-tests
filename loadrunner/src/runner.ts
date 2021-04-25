import { Browser, BrowserContext, Page } from "playwright-chromium";

import ClassLog from "./vus/classLog";
import VirtualPupil from "./vus/pupil";
import VirtualTeacher from "./vus/teacher";
import VirtualUser from "./vus/base";
import newLogger from "./logger";
import statsd, { CLASSES, VUS } from "./statsd";
import EventEmitter from "events";
import { Logger } from "winston";
import { Config } from "./vus/config";

export default class LoadRunner extends EventEmitter {
    logger = newLogger("runner");
    pages: Map<string, Page>;
    runID: string;
    url: string;
    accounts: Classroom[];
    screenshotPath: string;

    vus: VirtualUser[] = [];
    constructor(pages: Map<string, Page>, runID: string, url: string, accounts: Classroom[], screenshotPath: string) {
        super();
        this.pages = pages;
        this.runID = runID;
        this.url = url;
        this.accounts = accounts;
        this.screenshotPath = screenshotPath;
    }

    async start() {
        this.logger.info("Starting up")

        for (let i = 0; i < this.accounts.length; i++) {
            const classroom = this.accounts[i];
            statsd.increment(CLASSES);
            if (classroom.prepared) {
                this.logger.info("Starting prepared classroom");
                const vus = await this.startPreparedClassroom(classroom)
                this.vus.push(...vus);
            } else {
                this.logger.info("Starting new classroom");
                const vus = await this.startNewClassroom(classroom);
                this.vus.push(...vus);
            }
            await new Promise(resolve => setTimeout(resolve, 1 * 1000));
        }
    }

    async stop() {
        let pending = this.vus.length;
        this.vus.forEach(vu => {
            vu.on("stopped", () => {
                pending--;
                if (pending <= 0) {
                    this.emit("stopped");
                }
            });
            vu.stop();
        });
    }

    async startPreparedClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const vus: VirtualUser[] = [];

        const vu = await this.startVirtualTeacher(classroom.teacher, {
            pageUrl: this.url,
            thinkTimeFactor: this.drawThinkTimeFactor()
        });
        vus.push(vu);

        for (let i = 0; i < classroom.pupils.length; i++) {
            const vu = await this.startVirtualPupil(classroom.pupils[i], {
                pageUrl: this.url,
                thinkTimeFactor: this.drawThinkTimeFactor()
            });
            vus.push(vu);

            await new Promise(resolve => setTimeout(resolve, 1 * 1000));
        }

        return vus;
    }

    async startNewClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const vus: VirtualUser[] = [];

        const classLog = new ClassLog(classroom.pupils.length);

        const vu = await this.startVirtualTeacher(classroom.teacher, {
            pageUrl: this.url,
            classLog: classLog,
            className: classroom.name,
            classSize: classroom.pupils.length,
            thinkTimeFactor: this.drawThinkTimeFactor()
        });
        vus.push(vu);

        for (let i = 0; i < classroom.pupils.length; i++) {
            classLog.onClassCreated(async classCode => {
                const vu = await this.startVirtualPupil(classroom.pupils[i], {
                    pageUrl: this.url,
                    classCode,
                    thinkTimeFactor: this.drawThinkTimeFactor()
                });
                vus.push(vu);
            });
        }

        return vus;
    }

    async startVirtualPupil(account: Pupil, config: Config): Promise<VirtualPupil> {
        const logger = newLogger(account.username);
        const page = this.pages.get(account.username);
        if (!page) {
            throw new Error("No page provided for " + account.username);
        }

        const vu = new VirtualPupil(logger, page, account, config, this.screenshotPath);

        this.handleVU(vu, page);
        vu.start();

        return vu;
    }

    async startVirtualTeacher(account: Teacher, config: Config): Promise<VirtualTeacher> {
        const logger = newLogger(account.email);
        const page = this.pages.get(account.email);
        if (!page) {
            throw new Error("No page provided for " + account.email);
        }

        const vu = new VirtualTeacher(logger, page, account, config, this.screenshotPath);

        this.handleVU(vu, page);
        vu.start();

        return vu;
    }

    async handleVU(vu: VirtualUser, page: Page) {
        vu.on("started", () => statsd.increment(VUS));
        vu.on("failed", e => {
            this.logger.error("VU failed", e);
        });
        vu.on("stopped", async () => {
            statsd.decrement(VUS);
            this.vus = this.vus.filter(v => v !== vu);
            try {
                const context = page.context();
                const browser = context.browser();
                if (browser) {
                    await browser.close();
                } else{
                    await context.close();
                }
            } catch(e) {
                this.logger.warn("Context was already closed", e)
            }
        });
    }

    drawThinkTimeFactor(): number {
        return Math.random() + 0.5;
    }
}
