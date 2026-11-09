import type { Request } from "express";

// cookie-parser types req.cookies as any; narrow it to the cookies we actually set
export const getAuthCookies = (req: Request) =>
  (req.cookies ?? {}) as { accessToken?: string; refreshToken?: string };
