import { prisma } from "../lib/prisma";
import {
  JOB_SEEKER_PERMISSIONS,
  PERMISSION_CATALOG,
  RECRUITER_PERMISSIONS,
} from "../config/permissions.config";
import { SystemRoleName } from "../constant/role";
import { logger } from "../config/logger";
import { invalidateRoleForAllUsers } from "../modules/auth/services/permission.service";

// System role grants live in code and are re-synced on every seed, so new features
// reach existing databases. To change what a system role can do, edit permissions.config.ts.
const ROLES = [
  {
    name: SystemRoleName.ADMIN,
    description: "Full access to everything",
    permissions: PERMISSION_CATALOG,
  },
  {
    name: SystemRoleName.RECRUITER,
    description: "Hires candidates",
    permissions: RECRUITER_PERMISSIONS,
  },
  {
    name: SystemRoleName.JOB_SEEKER,
    description: "Looks for jobs (default role on sign-up)",
    permissions: JOB_SEEKER_PERMISSIONS,
  },
];

export async function seedRoles() {
  for (const { name, description, permissions } of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, description, permissions, isSystem: true },
      update: { permissions },
    });

    // Users' permissions are cached in Redis for up to 1h; drop them so the new grants apply now.
    // ponytail: best effort, the TTL is the fallback if Redis is unreachable during a seed.
    try {
      await invalidateRoleForAllUsers(role.id);
    } catch (err) {
      logger.warn({ err, role: name }, "Could not clear permission cache, it expires within 1h");
    }

    logger.info(`Role ready: ${name}`);
  }
}
