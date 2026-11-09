import type { NextFunction, Request, Response } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import createHttpError from "http-errors";
import { verifyAccessToken } from "../../utils/jwt.js";
import { getAuthCookies } from "../../utils/authCookies.js";

const authMiddleware = () => (req: Request, _res: Response, next: NextFunction) => {
  const { accessToken, refreshToken } = getAuthCookies(req);

  if (!accessToken) {
    // a lapsed access token with a live refresh token tells the client to refresh and retry
    return next(
      refreshToken
        ? createHttpError(401, "TOKEN_EXPIRED")
        : createHttpError.Unauthorized("NO_TOKEN"),
    );
  }

  try {
    req.user = { id: verifyAccessToken(accessToken).id.toString() };
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return next(createHttpError(401, "TOKEN_EXPIRED"));
    }
    next(createHttpError(403, "INVALID_TOKEN"));
  }
};

export default authMiddleware;
