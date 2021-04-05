import winston, { Logger } from "winston";

let formats;
if (!process.env.PRODUCTION) {
    formats = [
        winston.format.timestamp(),
        winston.format.cli()
    ];
} else {
    formats = [
        winston.format.timestamp(),
        winston.format.json(),
    ];
}

export const root = winston.createLogger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(...formats)
});

export default function newLogger(name: string): Logger {
    return root.child({ logger: name });
}
