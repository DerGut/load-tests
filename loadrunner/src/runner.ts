import path from "path";

import { Browser } from "playwright-chromium";

import ClassLog from "./vus/classLog";
import VirtualPupil from "./vus/pupil";
import VirtualTeacher from "./vus/teacher";
import VirtualUser from "./vus/base";
import newLogger from "./logger";

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

    async start(): Promise<VirtualUser[]> {
        this.logger.info("Starting up")
        const promises: Promise<VirtualUser[]>[] = this.accounts.map(
            async classroom => {
                this.logger.info("next classroom");
                if (classroom.prepared) {
                    return this.startPreparedClassroom(classroom);
                } else {
                    return this.startNewClassroom(classroom);
                }
            });

        return Promise.all(promises).then(all => all.flat());
    }

    async startPreparedClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const promises: Promise<VirtualUser>[] = classroom.pupils.map(
            async pupil => {
                return new Promise(async _ => {
                    const context = await this.browser.newContext();
                    const vu = new VirtualPupil(context, pupil, {
                        pageUrl: this.url,
                        thinkTimeFactor: this.drawThinkTimeFactor()
                    });
                    console.time(vu.id);
                    vu.run().catch(e => {
                        this.logger.error(`Caught exception: ${e}`);
                        this.logger.error(e);
                        console.timeEnd(vu.id);
                    });
                    return vu;
                });
            });
        promises.push(new Promise(async _ => {
            const context = await this.browser.newContext();
            const vu = new VirtualTeacher(context, classroom.teacher, {
                pageUrl: this.url,
                thinkTimeFactor: this.drawThinkTimeFactor()
            });
            vu.run();
            return vu;
        }));

        return Promise.all(promises);
    }

    async startNewClassroom(classroom: Classroom): Promise<VirtualUser[]> {
        const classLog = new ClassLog(classroom.pupils.length);
        const promises: Promise<VirtualUser>[] = classroom.pupils.map(
            pupil => {
                return new Promise(async resolve => {
                    classLog.onClassCreated(async joinCode => {
                        const context = await this.browser.newContext();
                        const vu = new VirtualPupil(context, pupil, {
                            pageUrl: joinUrl(this.url),
                            joinCode,
                            thinkTimeFactor: this.drawThinkTimeFactor()
                        });
                        vu.run();
                        resolve(vu);
                    });
                });
            });
        promises.push(new Promise(async _ => {
            const context = await this.browser.newContext();
            const vu = new VirtualTeacher(context, classroom.teacher, {
                pageUrl: this.url,
                classLog: classLog,
                className: classroom.name,
                classSize: classroom.pupils.length,
                thinkTimeFactor: this.drawThinkTimeFactor()
            });
            vu.run();
            return vu;
        }));

        return Promise.all(promises);
    }

    drawThinkTimeFactor(): number {
        return Math.random() + 0.5;
    }
}


function joinUrl(pageUrl: string): string {
    return path.join(pageUrl, "/join");
}
