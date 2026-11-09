import { randomUUID } from "node:crypto";
import type { SerializedRequest, SerializedResponse } from "pino";
import { pinoHttp } from "pino-http";
import { logger } from "../config/logger";

// One log line per request, like morgan. Also attaches `req.log` (a child
// logger tagged with the request id) for use inside route handlers.
export const requestLogger = pinoHttp({
  logger,
  // reuse the id from the proxy/client if present, so logs can be traced across services
  genReqId: (req, res) => {
    const id = (req.headers["x-request-id"] as string) || randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res, time) =>
    `${req.method} ${req.url} ${res.statusCode} ${Math.round(time)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  // keep lines short: just what you'd want from morgan
  serializers: {
    req: (req: SerializedRequest) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.remoteAddress,
    }),
    res: (res: SerializedResponse) => ({ statusCode: res.statusCode }),
  },
  autoLogging: { ignore: (req) => req.url === "/health" }, // skip load-balancer pings
});
