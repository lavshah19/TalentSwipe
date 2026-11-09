import { prisma } from "../lib/prisma";
import { PERMISSION_CATALOG } from "../config/permissions.config";
import { SystemRoleName } from "../constant/role";
import { logger } from "../config/logger";

// ADMIN always gets the whole catalog (re-synced on every seed, so new permissions
// reach it automatically). The other roles start with no grants and are never
// overwritten on re-seed, so edits made later aren't lost.
const ROLES = [
  {
    name: SystemRoleName.ADMIN,
    description: "Full access to everything",
    permissions: PERMISSION_CATALOG,
    syncPermissions: true,
  },
  {
    name: SystemRoleName.RECRUITER,
    description: "Hires candidates",
    permissions: {},
    syncPermissions: false,
  },
  {
    name: SystemRoleName.JOB_SEEKER,
    description: "Looks for jobs (default role on sign-up)",
    permissions: {},
    syncPermissions: false,
  },
];

export async function seedRoles() {
  for (const { name, description, permissions, syncPermissions } of ROLES) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description, permissions, isSystem: true },
      update: syncPermissions ? { permissions } : {},
    });
    logger.info(`Role ready: ${name}`);
  }
}
