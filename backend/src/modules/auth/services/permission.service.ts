// services/permission.service.ts
import redis from "../../../config/redis.js";
import { prisma } from "../../../lib/prisma.js";

export interface UserPermissions {
  roleId: string;
  permissions: Record<string, string[]>;
  isActive: boolean;
}

const USER_PERMISSIONS_PREFIX = "user:permissions:";
const USER_PERMISSIONS_TTL = 3600; // safety-net expiry, in case an invalidation is ever missed

// single source of truth per user — one cache read covers role + permissions
export const getUserPermissions = async (userId: string): Promise<UserPermissions | null> => {
  const cacheKey = `${USER_PERMISSIONS_PREFIX}${userId}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as UserPermissions;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      roleId: true,
      role: { select: { permissions: true, isActive: true } },
    },
  });

  if (!user || user.deletedAt || !user.role) return null;

  const data: UserPermissions = {
    roleId: user.roleId,
    permissions: (user.role.permissions as Record<string, string[]>) || {},
    isActive: user.role.isActive,
  };

  await redis.set(cacheKey, JSON.stringify(data), "EX", USER_PERMISSIONS_TTL);
  return data;
};

// call when ONE user's roleId changes
export const invalidateUserPermissions = async (userId: string): Promise<void> => {
  await redis.del(`${USER_PERMISSIONS_PREFIX}${userId}`);
};

// call when a ROLE itself is edited — affects every user holding that role
export const invalidateRoleForAllUsers = async (roleId: string): Promise<void> => {
  const affectedUsers = await prisma.user.findMany({
    where: { roleId },
    select: { id: true },
  });

  if (affectedUsers.length === 0) return;

  const pipeline = redis.pipeline();
  for (const u of affectedUsers) {
    pipeline.del(`${USER_PERMISSIONS_PREFIX}${u.id}`);
  }
  await pipeline.exec(); // one round trip instead of N sequential deletes
};
