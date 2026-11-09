import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { SystemRoleName } from "../constant/role";

// Well-known credentials, so they must never exist in production.
const DEV_PASSWORD = "Password123!";

const USERS = [
  { email: "admin@talentswipe.dev", fullName: "Admin User", role: SystemRoleName.ADMIN },
  {
    email: "recruiter@talentswipe.dev",
    fullName: "Recruiter User",
    role: SystemRoleName.RECRUITER,
  },
  {
    email: "jobseeker@talentswipe.dev",
    fullName: "Job Seeker User",
    role: SystemRoleName.JOB_SEEKER,
  },
];

// Needs the roles to exist first (seedRoles). Existing users are left untouched.
export async function seedUsers() {
  if (env.NODE_ENV === "production") {
    logger.warn("Skipping demo users: NODE_ENV is production");
    return;
  }

  const password = await bcrypt.hash(DEV_PASSWORD, 10);

  for (const { email, fullName, role: roleName } of USERS) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`Role ${roleName} not found, run seedRoles first`);

    await prisma.user.upsert({
      where: { email },
      create: { email, password, fullName, roleId: role.id },
      update: {},
    });
    logger.info(`User ready: ${email} (${roleName})`);
  }

//   logger.info(`Demo users share the password: ${DEV_PASSWORD}`);
}
