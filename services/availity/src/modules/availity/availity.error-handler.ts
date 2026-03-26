import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  AvailityError,
  AvailityValidationError,
} from "./availity.errors.js";
import { logger } from "../../lib/logger.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "ZodError",
      message: "Validation failed",
      details: err.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AvailityValidationError) {
    res.status(400).json({
      error: err.name,
      message: err.message,
      details: err.details ?? null,
    });
    return;
  }

  if (err instanceof AvailityError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      details: err.details ?? null,
    });
    return;
  }

  if (err && typeof err === "object" && "message" in err) {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({
      error: "InternalServerError",
      message: String((err as { message: unknown }).message),
    });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    error: "InternalServerError",
    message: "An unexpected error occurred",
  });
}
