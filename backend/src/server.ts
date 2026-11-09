import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./lib/prisma";
import app from "./app";

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});

function shutdown(signal: string, code = 0) {
  logger.info(`${signal} received, shutting down`);
  server.close((err) => {
    if (err) logger.error({ err }, "Error while closing server");
    // close DB pool after in-flight requests finish, then flush logs and exit
    prisma
      .$disconnect()
      .catch((dbErr: unknown) => logger.error({ err: dbErr }, "Error disconnecting Prisma"))
      .finally(() => logger.flush(() => process.exit(err ? 1 : code)));
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
