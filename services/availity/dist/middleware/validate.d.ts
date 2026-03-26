import type { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
/**
 * Express middleware that validates `req.body` (or `req.params`)
 * against a Zod schema and returns 400 with structured errors on failure.
 */
export declare function validateBody(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateParams(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validate.d.ts.map