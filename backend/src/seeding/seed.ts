import { prisma } from "../lib/prisma";
import { logger } from "../config/logger";
import { seedRoles } from "./role.seed";
import { seedUsers } from "./user.seed";

// Idempotent: safe to run on every deploy. Run with `npm run db:seed`.
async function main() {
  await seedRoles();
  await seedUsers(); // after roles: each user needs one
}

main()
  .then(() => logger.info("Seeding done"))
  .catch((err: unknown) => {
    logger.error({ err }, "Seeding failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
