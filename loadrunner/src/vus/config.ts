import ClassLog from "./classLog";

export type Config = {
    pageUrl: string
    thinkTimeFactor: number

    className?: string
    classSize?: number
    classCode?: string
    classLog?: ClassLog
};
