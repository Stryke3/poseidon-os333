import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
export declare function createDenialController(prisma: PrismaClient): {
    intake: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    classify: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    generateAppeal: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    submitRecovery: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    outcome: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    queue: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getDetails: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};
export declare function intakeDenial(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function classifyDenialEvent(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function generateAppealPacket(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare const submitRecoveryPacket: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const recordDenialOutcome: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const denialQueue: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const denialDetails: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=denial.controller.d.ts.map