import { prisma } from "../../../lib/prisma.js";
import type { DeviceInfo } from "../types/index.js";

export class AuthRepository {
  static async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  static async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  }

  static async createUser(
    email: string,
    password: string,
    fullName: string,
    roleId: string,
    phone?: string,
  ) {
    return prisma.user.create({
      data: { email, password, fullName, roleId, phone },
      include: { role: true },
    });
  }

  static async updateUser(id: string, data: { fullName?: string; phone?: string }) {
    return prisma.user.update({
      where: { id },
      data,
      include: { role: true },
    });
  }

  static async findRoleByName(name: string) {
    return prisma.role.findUnique({
      where: { name },
    });
  }

  static async createRefreshToken(
    token: string,
    userId: string,
    expiresAt: Date,
    deviceInfo?: DeviceInfo,
  ) {
    return prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
        browser: deviceInfo?.browser,
        os: deviceInfo?.os,
        device: deviceInfo?.device ?? "desktop",
      },
    });
  }

  static async deleteRefreshToken(token: string) {
    return prisma.refreshToken.deleteMany({
      where: { token },
    });
  }

  static async findRefreshToken(token: string) {
    return prisma.refreshToken.findUnique({
      where: { token },
    });
  }
}
