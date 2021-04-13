import path from "path";
import v8 from "v8";

import { Browser } from "playwright-chromium";

import ClassLog from "./vus/classLog";
import VirtualPupil from "./vus/pupil";
import VirtualTeacher from "./vus/teacher";
import VirtualUser from "./vus/base";
import newLogger from "./logger";
import statsd, { CLASSES, VUS } from "./statsd";

export default class LoadRunner {
    logger = newLogger("runner");
    browser: Browser;
    runID: string;
    url: string;
    accounts: Classroom[];
    constructor(browser: Browser, runID: string, url: string, accounts: Classroom[]) {
        this.browser = browser;
        this.runID = runID;
        this.url = url;
        this.accounts = accounts;
    }

    async start() {
        this.logger.info("Starting up")
        const promises = [];
        for (let i = 0; i < this.accounts.length; i++) {
            this.logger.info("next classroom");
            const classroom = this.accounts[i];
            statsd.increment(CLASSES);
            if (classroom.prepared) {
                promises.push(this.startPreparedClassroom(classroom));
            } else {
                // promises.push(this.startNewClassroom(classroom));
            }
            await new Promise(resolve => setTimeout(resolve, 60 * 1000));
        }

        await Promise.all(promises).then(all => all.flat());
    }

    async startPreparedClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const vus: VirtualUser[] = [];
        for (let i = 0; i < classroom.pupils.length; i++) {
            const pupil = classroom.pupils[i];
            const context = await this.browser.newContext();
            const vu = new VirtualPupil(context, pupil, {
                pageUrl: this.url,
                thinkTimeFactor: this.drawThinkTimeFactor()
            });
            statsd.increment(VUS);
            vu.run()
                .then(() => statsd.decrement(VUS))
                .catch(e => {
                    this.logger.error(`Caught exception: ${e}`);
                    this.logger.error(e);
                    statsd.decrement(VUS);
                });
            vus.push(vu);
            await new Promise(resolve => setTimeout(resolve, 60 * 1000));
        }

        const context = await this.browser.newContext();
        const vu = new VirtualTeacher(context, classroom.teacher, {
            pageUrl: this.url,
            thinkTimeFactor: this.drawThinkTimeFactor()
        });
        vu.run();
        vus.push(vu);

        return vus;
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
