import { Router } from "express";
import { loginODT, registerODT, updateProfileODT } from "../validator/auth.validator.js";
import { validateBody } from "../../../middleware/validate.js";
import { catchAsync } from "../../../utils/catchAsync.utils.js";
import authMiddleware from "../../../middleware/auth/authenticate.middleware.js";
import { AuthController } from "../controller/auth.controller.js";

const router = Router();

router.post("/login", validateBody(loginODT), catchAsync(AuthController.login));
router.post("/register", validateBody(registerODT), catchAsync(AuthController.register));
router.post("/logout", catchAsync(AuthController.logout));
router.post("/refresh-token", catchAsync(AuthController.refreshToken));

router.get("/me", authMiddleware(), catchAsync(AuthController.me));
router.patch(
  "/me",
  authMiddleware(),
  validateBody(updateProfileODT),
  catchAsync(AuthController.updateProfile),
);
router.get("/socket-ticket", authMiddleware(), catchAsync(AuthController.socketTicket));

export default router;
