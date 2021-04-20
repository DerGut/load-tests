import { BrowserContext } from "playwright-chromium";

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
            vu.stop()
        });
    }

    async startPreparedClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const vus: VirtualUser[] = [];

        const context = this.getContext();
        const vu = this.buildTeacher(context, classroom.teacher);
        this.handleVU(vu, context);
        vu.start();
        vus.push(vu);

        for (let i = 0; i < classroom.pupils.length; i++) {
            const pupil = classroom.pupils[i];

            const context = this.getContext();
            const vu = this.buildPupil(context, pupil);
            this.handleVU(vu, context);
            vu.start();
            vus.push(vu);

            await new Promise(resolve => setTimeout(resolve, 1 * 1000));
        }

        return vus;
    }

    getContext(): BrowserContext {
        const context = this.contexts.pop();
        if (!context) {
            throw new Error("Not enough contexts provided");
        }
        return context;
    }

    buildTeacher(context: BrowserContext, account: Teacher): VirtualTeacher {
        return new VirtualTeacher(context, account, {
            pageUrl: this.url,
            thinkTimeFactor: this.drawThinkTimeFactor()
        });
    }

    buildPupil(context: BrowserContext, account: Pupil): VirtualPupil {
        return new VirtualPupil(context, account, {
            pageUrl: this.url,
            thinkTimeFactor: this.drawThinkTimeFactor()
        });
    }

    async handleVU(vu: VirtualUser, context: BrowserContext) {
        vu.on("started", () => statsd.increment(VUS));
        vu.on("failed", e => {
            this.logger.error("VU failed", e);
        });
        vu.on("stopped", async () => {
            statsd.decrement(VUS);
            try {
                await context.close();
            } catch(e) {
                this.logger.warning("Context was already closed", e)
            }
        });
    }

    async startNewClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const vus: VirtualUser[] = [];

        const classLog = new ClassLog(classroom.pupils.length);

        const context = this.getContext();
        const vu = new VirtualTeacher(context, classroom.teacher, {
            pageUrl: this.url,
            classLog: classLog,
            className: classroom.name,
            classSize: classroom.pupils.length,
            thinkTimeFactor: this.drawThinkTimeFactor()
        });
        this.handleVU(vu, context);
        vu.start();
        vus.push(vu);

        for (let i = 0; i < classroom.pupils.length; i++) {
            const pupil = classroom.pupils[i];
            classLog.onClassCreated(async joinCode => {
                const context = this.getContext();
                const vu = new VirtualPupil(context, pupil, {
                    pageUrl: this.url,
                    classCode: joinCode,
                    thinkTimeFactor: this.drawThinkTimeFactor()
                });
                this.handleVU(vu, context);
                vu.start();
                vus.push(vu);
            });
        }

        return vus;
    }

    drawThinkTimeFactor(): number {
        return Math.random() + 0.5;
    }
}
