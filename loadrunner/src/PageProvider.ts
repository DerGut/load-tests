import { Browser, BrowserContextOptions, BrowserType, chromium, LaunchOptions, Page } from "playwright-chromium";
import { PageMap } from "./runner";

type PageOptionsProvider = (account: Account) => BrowserContextOptions;

export class PageProvider {
    type: BrowserType<Browser>;
    browserOptions: LaunchOptions;
    contextOptionsProvider: PageOptionsProvider
    constructor(type: BrowserType<Browser>, browserOptions: LaunchOptions, pageOptionsProvider: PageOptionsProvider) {
        this.type = type;
        this.browserOptions = browserOptions;
        this.contextOptionsProvider = pageOptionsProvider;
    }
    
    async provideFromBrowsers(accounts: Classroom[]): Promise<PageMap> {
        const pages = new Map();
        for (let i = 0; i < accounts.length; i++) {
            const classroom = accounts[i];

            const browser = await chromium.launch(this.browserOptions);
            const page = await this.pageForAccountAndBrowser(classroom.teacher, browser);
            pages.set(classroom.teacher.email, page);

            for (let j = 0; j < classroom.pupils.length; j++) {
                const pupil = classroom.pupils[j];

                const browser = await chromium.launch(this.browserOptions);
                const page = await this.pageForAccountAndBrowser(pupil, browser);
                pages.set(pupil.username, page);
            }
        }

        return pages;
    }

    async provideFromContexts(accounts: Classroom[]): Promise<PageMap> {
        const pages = new Map();

        const browser = await this.type.launch(this.browserOptions);

        for (let i = 0; i < accounts.length; i++) {
            const classroom = accounts[i];

            const page = await this.pageForAccountAndBrowser(classroom.teacher, browser);
            pages.set(classroom.teacher.id(), page);

            for (let j = 0; j < classroom.pupils.length; j++) {
                const pupil = classroom.pupils[j];

                const page = await this.pageForAccountAndBrowser(pupil, browser);
                pages.set(pupil.id(), page);
            }
        }

        return pages;
    }

    async pageForAccountAndBrowser(account: Account, browser: Browser): Promise<Page> {
        const options = this.contextOptionsProvider(account);
        const context = await browser.newContext(options);
        return await context.newPage();
    }
}
