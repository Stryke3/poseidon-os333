import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
export declare function createValidatorController(prisma: PrismaClient): {
    validatePreSubmit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    preSubmitValidation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=validator.controller.d.ts.map