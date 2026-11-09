import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
  // pretty output locally, raw JSON in production (for log aggregators)
  ...(env.NODE_ENV === "development" && {
    transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
  }),
});
