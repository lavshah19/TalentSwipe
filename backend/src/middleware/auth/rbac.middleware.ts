// middleware/rbac.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { getUserPermissions } from "../../modules/auth/services/permission.service.js";

export const authorize = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const permissions = await getUserPermissions(req.user.id);

    if (!permissions || !permissions.isActive) {
      res.status(403).json({ message: "Role inactive or not found" });
      return;
    }

    const allowedActions = permissions.permissions?.[resource];
    if (!Array.isArray(allowedActions) || !allowedActions.includes(action)) {
      res.status(403).json({
        message: `You don't have permission to ${action} ${resource}`,
      });
      return;
    }

    next();
  };
};
