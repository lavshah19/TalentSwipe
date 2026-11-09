import { UAParser } from "ua-parser-js";
import createHttpError from "http-errors";
import bcrypt from "bcrypt";
import {
  daysToMs,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../../utils/jwt.js";
import type { AuthUser, DeviceInfo, IAuthResponse } from "../types/index.js";
import type { UpdateProfileInput } from "../validator/auth.validator.js";
import { AuthRepository } from "../repository/auth.repository.js";
import { SystemRoleName } from "../../../constant/role.js";

export class AuthService {
  static async login(email: string, password: string, deviceInfo?: DeviceInfo) {
    const user = await AuthRepository.findUserByEmail(email);
    if (!user) {
      throw new createHttpError.Unauthorized("Invalid credentials.");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new createHttpError.Unauthorized("Invalid credentials.");
    }

    return AuthService.createTokenResponse(user, deviceInfo);
  }

  static async register(
    email: string,
    password: string,
    fullName: string,
    deviceInfo?: DeviceInfo,
    phone?: string,
  ) {
    const existing = await AuthRepository.findUserByEmail(email);
    if (existing) {
      throw new createHttpError.Conflict("Email is already registered.");
    }

    // public sign-up always gets the least-privileged role
    const role = await AuthRepository.findRoleByName(SystemRoleName.JOB_SEEKER);
    if (!role) {
      throw new createHttpError.InternalServerError("Default role is not configured.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await AuthRepository.createUser(email, hashedPassword, fullName, role.id, phone);

    return AuthService.createTokenResponse(user, deviceInfo);
  }

  static async logout(refreshToken?: string) {
    if (refreshToken) {
      await AuthRepository.deleteRefreshToken(refreshToken);
    }
  }

  // used on app start to hydrate the client's auth store from the accessToken cookie
  static async getCurrentUser(userId: string) {
    const user = await AuthRepository.findUserById(userId);
    if (!user) {
      throw new createHttpError.Unauthorized("User not found.");
    }
    return AuthService.toAuthUser(user);
  }

  static toAuthUser(user: AuthUser): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: { name: user.role.name, permissions: user.role.permissions },
    };
  }

  static async updateProfile(userId: string, input: UpdateProfileInput) {
    const existing = await AuthRepository.findUserById(userId);
    if (!existing) throw new createHttpError.NotFound("User not found.");

    const user = await AuthRepository.updateUser(userId, input);
    return AuthService.toAuthUser(user);
  }

  static async createTokenResponse(
    user: AuthUser,
    deviceInfo?: DeviceInfo,
  ): Promise<IAuthResponse> {
    const accessToken = generateAccessToken({ id: user.id });
    const refreshToken = generateRefreshToken({ id: user.id });

    await AuthRepository.createRefreshToken(
      refreshToken,
      user.id,
      new Date(Date.now() + daysToMs(7)),
      deviceInfo,
    );
    return {
      accessToken,
      refreshToken,
      user: AuthService.toAuthUser(user),
    };
  }

  // user.id is a uuid string, not numeric — the refresh token's payload and the
  // RefreshToken.userId column both carry that same string, never parseInt() it.
  //
  // Rotates the refresh token on every use (delete the old row, issue a new one) rather
  // than just minting a fresh access token off the same refresh token — that's what lets
  // deviceInfo actually get recorded here, and it caps how long a stolen refresh token
  // stays usable if it's ever replayed after the legitimate client already rotated past it.
  static async refreshToken(
    token: string | undefined,
    deviceInfo?: DeviceInfo,
  ): Promise<IAuthResponse> {
    if (!token) {
      throw new createHttpError.Unauthorized("Refresh token is required.");
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw new createHttpError.Unauthorized("Invalid or expired refresh token.");
    }

    const existingToken = await AuthRepository.findRefreshToken(token);
    if (
      !existingToken ||
      existingToken.userId !== decoded.id ||
      existingToken.expiresAt <= new Date()
    ) {
      throw new createHttpError.Unauthorized("Invalid or expired refresh token.");
    }

    const user = await AuthRepository.findUserById(decoded.id);
    if (!user) {
      throw new createHttpError.Unauthorized("User not found.");
    }

    await AuthRepository.deleteRefreshToken(token);

    return AuthService.createTokenResponse(user, deviceInfo);
  }

  static getDeviceInfo(userAgent?: string, ipAddress?: string): DeviceInfo {
    const result = new UAParser(userAgent).getResult();

    return {
      userAgent: userAgent ?? "unknown",
      ipAddress: ipAddress ?? "unknown",
      browser: result.browser.name ?? "unknown",
      os: result.os.name ?? "unknown",
      device: result.device.type ?? "desktop",
    };
  }
}
