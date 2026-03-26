import type { Request, Response, NextFunction } from "express";
/**
 * POST /score — accepts {@link scorePriorAuthBodySchema}: strict case fields plus optional
 * `packetId` / `diagnosisCodes` / legacy `hcpcs`; merges packet doc types when `packetId` is set.
 */
export declare function scorePayerCase(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function ingestPayerOutcome(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function createPayerRule(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getPayerRules(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=payerBehavior.controller.d.ts.map