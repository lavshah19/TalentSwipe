import { Router } from "express";
const router = Router();
import authRoute from "../modules/auth/routes/auth.route.js";

interface Route {
  path: string;
  route: Router;
}

const routes: Route[] = [{ path: "/auth", route: authRoute }];
routes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
