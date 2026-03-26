import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
export declare function createPacketController(prisma: PrismaClient): {
    createPacket: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    listPacketsForCase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getPacket: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    generatePacket: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    postPacketPayerScore: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    generateAndSubmitPriorAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    submitPacketPriorAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=packet.controller.d.ts.map