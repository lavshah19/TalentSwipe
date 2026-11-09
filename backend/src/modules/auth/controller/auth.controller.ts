import type { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";
import { StatusCodes } from "../../../constant/statusCode.js";
import { getAuthCookies } from "../../../utils/authCookies.js";
import { daysToMs, generateSocketTicket } from "../../../utils/jwt.js";
import type { LoginInput, RegisterInput, UpdateProfileInput } from "../validator/auth.validator.js";
import type { IAuthResponse } from "../types/index.js";

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = daysToMs(7);

const getAuthCookieOptions = (req: Request) => ({
  httpOnly: true,
  secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  sameSite: "lax" as const,
});

const setAuthCookies = (req: Request, res: Response, tokens: IAuthResponse) => {
  const options = getAuthCookieOptions(req);
  res.cookie("refreshToken", tokens.refreshToken, { ...options, maxAge: REFRESH_TOKEN_MAX_AGE });
  res.cookie("accessToken", tokens.accessToken, { ...options, maxAge: ACCESS_TOKEN_MAX_AGE });
};

const clearAuthCookies = (req: Request, res: Response) => {
  const options = getAuthCookieOptions(req);
  res.clearCookie("refreshToken", options);
  res.clearCookie("accessToken", options);
};

// plain object of arrow functions: safe to pass to the router unbound
export const AuthController = {
  login: async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput;
    const deviceInfo = AuthService.getDeviceInfo(req.headers["user-agent"], req.ip);
    const result = await AuthService.login(email, password, deviceInfo);
    setAuthCookies(req, res, result);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Login successful",
      data: { user: result.user },
    });
  },

  register: async (req: Request, res: Response) => {
    const { email, password, fullName } = req.body as RegisterInput;
    const deviceInfo = AuthService.getDeviceInfo(req.headers["user-agent"], req.ip);
    const result = await AuthService.register(email, password, fullName, deviceInfo);
    setAuthCookies(req, res, result);

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Registration successful",
      data: { user: result.user },
    });
  },

  // Web sockets can't send the httpOnly accessToken cookie cross-origin, so the browser
  // trades it here for a 60s ticket and passes that in the socket handshake.
  socketTicket: (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    res.status(StatusCodes.OK).json({
      success: true,
      data: { ticket: generateSocketTicket({ id: req.user.id }) },
    });
  },

  me: async (req: Request, res: Response) => {
    const user = await AuthService.getCurrentUser(req.user.id);

    res.status(StatusCodes.OK).json({
      success: true,
      data: { user },
    });
  },

  updateProfile: async (req: Request, res: Response) => {
    const user = await AuthService.updateProfile(req.user.id, req.body as UpdateProfileInput);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Profile updated",
      data: { user },
    });
  },

  refreshToken: async (req: Request, res: Response) => {
    const deviceInfo = AuthService.getDeviceInfo(req.headers["user-agent"], req.ip);

    try {
      const result = await AuthService.refreshToken(getAuthCookies(req).refreshToken, deviceInfo);
      setAuthCookies(req, res, result);

      res.status(StatusCodes.OK).json({
        success: true,
        message: "Token refreshed successfully",
        data: { user: result.user },
      });
    } catch (error) {
      clearAuthCookies(req, res);
      throw error;
    }
  },

  logout: async (req: Request, res: Response) => {
    await AuthService.logout(getAuthCookies(req).refreshToken);
    clearAuthCookies(req, res);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Logout successful",
    });
  },
};
