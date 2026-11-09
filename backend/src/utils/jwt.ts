import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

import createHttpError from "http-errors";
import type { IJwtPayload, IRefreshTokenPayload } from "../interfaces/jwt.interface.js";

const JWT_SECRET = env.JWT_SECRET;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;

export const generateAccessToken = (payload: {
  id: string;
}) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" }); // for testing 15m later will be 1h
};
export const generateSocketTicket = (payload: {   // will be used to authenticate socket connection not need currently 
  id: string;
}) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "60s" });
};

// unique jti: two tokens for the same user in the same second (register→login, double-click,
// two tabs refreshing) would otherwise be byte-identical and clash on RefreshToken.token @unique
export const generateRefreshToken = (payload: { id: string }) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d", jwtid: crypto.randomUUID() });
};

export const verifyAccessToken = (token: string): IJwtPayload => {
  const decoded = jwt.verify(token, JWT_SECRET);

  if (
    typeof decoded !== "object" ||
    !("id" in decoded) ) {
    throw createHttpError.Unauthorized("Invalid token payload");
  }

  return decoded as IJwtPayload;
};

export const verifyRefreshToken = (token: string): IRefreshTokenPayload=> {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET);

  if (typeof decoded !== "object" || !("id" in decoded)) {
    throw createHttpError.Unauthorized("Invalid refresh token payload");
  }

  return decoded as IRefreshTokenPayload;
};

export const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;