import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { globalErrorHandler, notFoundHandler } from "./middleware/globalErrorHandler";
import { requestLogger } from "./middleware/requestLogger";
import routes from "./routes";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // behind a load balancer / reverse proxy
app.use(requestLogger); // first, so every request (even rejected ones) is logged
app.use(helmet());
// credentials: true so the browser may send/receive the auth cookies cross-origin
app.use(cors({ origin: env.CORS_ORIGIN.length ? env.CORS_ORIGIN : false, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
