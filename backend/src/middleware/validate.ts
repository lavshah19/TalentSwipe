import type { RequestHandler } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import type { ZodType } from "zod";
import createHttpError from "http-errors";

export function validateBody<T>(schema: ZodType<T>): RequestHandler<ParamsDictionary, unknown, T> {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        createHttpError(422, "Validation failed", {
          details: result.error.issues,
        }),
      );
    }
    req.body = result.data;
    next();
  };
}

export function validateParams<T extends ParamsDictionary>(schema: ZodType<T>): RequestHandler<T> {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(
        createHttpError(422, "Validation failed", {
          details: result.error.issues,
        }),
      );
    }
    // Express 5 made req.params getter-only, same as req.query below.
    Object.defineProperty(req, "params", {
      value: result.data,
      writable: true,
      configurable: true,
    });
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(
        createHttpError(422, "Validation failed", {
          details: result.error.issues,
        }),
      );
    }
    // Express 5 made req.query getter-only, so a plain assignment throws
    Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
    next();
  };
}
