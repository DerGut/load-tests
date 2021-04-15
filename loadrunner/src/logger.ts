import winston, { Logform, Logger } from "winston";

let formats: Logform.Format[];
if (process.env.NODE_ENV !== "production") {
    formats = [
        winston.format.timestamp(),
        winston.format.simple()
    ];
} else {
    formats = [
        winston.format.timestamp(),
        winston.format.json(),
    ];
}

export const root = winston.createLogger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(...formats),
    defaultMeta: {
        runId: process.env.RUN_ID
    }
});

export default function newLogger(name: string): Logger {
    return root.child({ logger: name });
}
