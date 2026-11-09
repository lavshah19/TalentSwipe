import { prisma } from "../lib/prisma";
import { logger } from "../config/logger";
import { seedRoles } from "./role.seed";

// Idempotent: safe to run on every deploy. Run with `npm run db:seed`.
async function main() {
  await seedRoles();
}

main()
  .then(() => logger.info("Seeding done"))
  .catch((err: unknown) => {
    logger.error({ err }, "Seeding failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
