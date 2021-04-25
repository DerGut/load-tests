import { chromium, LaunchOptions, Page } from "playwright-chromium";
import newLogger from "./logger";

export class BrowserProvider {
    config: LaunchOptions
    constructor(config: LaunchOptions) {
        this.config = config;
    }
    
    async initializePages(accounts: Classroom[]): Promise<Map<string, Page>> {
        const pages = new Map();
        for (let i = 0; i < accounts.length; i++) {
            const classroom = accounts[i];

            const browser = await chromium.launch(this.config);
            const page = await browser.newPage();
            pages.set(classroom.teacher.email, page);
            for (let j = 0; j < classroom.pupils.length; j++) {
                const pupil = classroom.pupils[j];
                const browser = await chromium.launch(this.config);
                const logger = newLogger("playwright-" + pupil.username);
                const page = await browser.newPage({
                    logger: {
                        isEnabled: () => process.env.NODE_ENV === "production",
                        log: (name, _severity, message, args) => {
                            if (message instanceof Error) {
                                logger.error(message);
                            } else {
                                logger.debug(message, {name, args});
                            }
                        }
                    },
                });
                pages.set(pupil.username, page);
            }
        }

        return pages;
    }
}