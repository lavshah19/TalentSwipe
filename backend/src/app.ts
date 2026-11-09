import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env";
import { globalErrorHandler, notFoundHandler } from "./middleware/globalErrorHandler";
import { requestLogger } from "./middleware/requestLogger";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // behind a load balancer / reverse proxy
app.use(requestLogger); // first, so every request (even rejected ones) is logged
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.length ? env.CORS_ORIGIN : false }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// routes go here: app.use("/api/users", usersRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
