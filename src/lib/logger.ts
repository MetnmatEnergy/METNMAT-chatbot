// config/logger.js
import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

// Custom log format
const myFormat = printf(({ level, message, timestamp, ...meta }) => {
    // If message is an object, stringify it nicely
    const msg =
        typeof message === "object"
            ? JSON.stringify(message, null, 2) // pretty print
            : message;

    const metaString =
        meta && Object.keys(meta).length > 0
            ? ` ${JSON.stringify(meta, null, 2)}`
            : "";

    return `${timestamp} [${level}] : ${msg}${metaString}`;
});

const logger = winston.createLogger({
    level: "info",
    format: combine(
        colorize({ all: true }), // colors in console
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        myFormat
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "logs/combined.log" }),
        new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    ],
});

export default logger;
