import type { ErrorRequestHandler, RequestHandler } from "express";
import createError, { isHttpError } from "http-errors";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(createError(404, `Route ${req.method} ${req.originalUrl} not found`));
};

// Express 5 forwards rejected async handlers here automatically.
export const globalErrorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const httpErr = isHttpError(err)
    ? err
    : createError(500, err instanceof Error ? err : String(err));

  // requestLogger logs the request line; attach the stack only for 5xx
  // (4xx are client mistakes and may carry the raw body)
  if (httpErr.status >= 500) res.err = httpErr;

  // http-errors sets expose=true for 4xx only, so 5xx internals never leak
  res.status(httpErr.status).json({
    error: httpErr.expose ? httpErr.message : "Internal Server Error",
  });
};
