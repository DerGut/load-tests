import path from "path";
import v8 from "v8";

import { Browser, BrowserContext } from "playwright-chromium";

import ClassLog from "./vus/classLog";
import VirtualPupil from "./vus/pupil";
import VirtualTeacher from "./vus/teacher";
import VirtualUser from "./vus/base";
import newLogger from "./logger";
import statsd, { CLASSES, VUS } from "./statsd";
import EventEmitter from "events";

export default class LoadRunner extends EventEmitter {
    logger = newLogger("runner");
    contexts: BrowserContext[];
    runID: string;
    url: string;
    accounts: Classroom[];
    vus: VirtualUser[] = [];
    constructor(contexts: BrowserContext[], runID: string, url: string, accounts: Classroom[]) {
        super();
        this.contexts = contexts;
        this.runID = runID;
        this.url = url;
        this.accounts = accounts;
    }

    async start() {
        this.logger.info("Starting up")
        for (let i = 0; i < this.accounts.length; i++) {
            this.logger.info("next classroom");
            const classroom = this.accounts[i];
            statsd.increment(CLASSES);
            if (classroom.prepared) {
                const pupils = await this.startPreparedClassroom(classroom)
                this.vus.push(...pupils);
            } else {
                // promises.push(this.startNewClassroom(classroom));
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
            vu.stop()
        });
    }

    async startPreparedClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const vus: VirtualUser[] = [];
        for (let i = 0; i < classroom.pupils.length; i++) {
            const pupil = classroom.pupils[i];
            const context = this.contexts.pop();
            if (!context) {
                throw new Error("Not enough contexts provided");
            }
            const vu = new VirtualPupil(context, pupil, {
                pageUrl: this.url,
                thinkTimeFactor: this.drawThinkTimeFactor()
            });
            this.handleVU(vu, context);
            vu.start();
            vus.push(vu);
            await new Promise(resolve => setTimeout(resolve, 1 * 1000));
        }

        const context = this.contexts.pop();
        if (!context) {
            throw new Error("Not enough contexts provided");
        }
        const vu = new VirtualTeacher(context, classroom.teacher, {
            pageUrl: this.url,
            thinkTimeFactor: this.drawThinkTimeFactor()
        });
        this.handleVU(vu, context);
        vu.start();
        vus.push(vu);

        return vus;
    }

    async handleVU(vu: VirtualUser, context: BrowserContext) {
        vu.on("started", () => statsd.increment(VUS));
        vu.on("failed", e => {
            this.logger.error("VU failed", e);
        });
        vu.on("stopped", async () => {
            statsd.decrement(VUS);
            await context.close();
        });
    }

    // async startNewClassroom(classroom: Classroom): Promise<VirtualUser[]> {
    //     const classLog = new ClassLog(classroom.pupils.length);
    //     const vus: VirtualUser[] = [];
    //     for (let i = 0; i < classroom.pupils.length; i++) {
    //         const pupil = classroom.pupils[i];
    //         classLog.onClassCreated(async joinCode => {
    //             const context = await this.browser.newContext();
    //             const vu = new VirtualPupil(context, pupil, {
    //                 pageUrl: joinUrl(this.url),
    //                 joinCode,
    //                 thinkTimeFactor: this.drawThinkTimeFactor()
    //             });
    //             vu.run();
    //             resolve(vu);
    //         });
    //     }
    //     promises.push(new Promise(async _ => {
    //         const context = await this.browser.newContext();
    //         const vu = new VirtualTeacher(context, classroom.teacher, {
    //             pageUrl: this.url,
    //             classLog: classLog,
    //             className: classroom.name,
    //             classSize: classroom.pupils.length,
    //             thinkTimeFactor: this.drawThinkTimeFactor()
    //         });
    //         vu.run();
    //         return vu;
    //     }));

    //     return Promise.all(promises);
    // }

    drawThinkTimeFactor(): number {
        return Math.random() + 0.5;
    }
}


function joinUrl(pageUrl: string): string {
    return path.join(pageUrl, "/join");
}
