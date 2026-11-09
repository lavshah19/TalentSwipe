import { env } from "./config/env";
import { logger } from "./config/logger";
import app from "./app";

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});

function shutdown(signal: string, code = 0) {
  logger.info(`${signal} received, shutting down`);
  server.close((err) => {
    if (err) logger.error({ err }, "Error while closing server");
    // flush buffered logs before exiting
    logger.flush(() => process.exit(err ? 1 : code));
  });
  // force exit if connections don't drain
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled rejection");
  shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  logger.flush(() => process.exit(1));
});
