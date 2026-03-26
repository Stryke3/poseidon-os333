import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
export declare function createAvailityController(prisma: PrismaClient): {
    healthCheckAvaility: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    checkEligibility: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    submitPriorAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getPriorAuthStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};
/** @deprecated Use createAvailityController */
export declare const createAvailityHandlers: typeof createAvailityController;
//# sourceMappingURL=availity.controller.d.ts.map