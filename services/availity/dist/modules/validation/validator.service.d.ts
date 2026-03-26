import type { PrismaClient } from "@prisma/client";
import type { ValidationInput, ValidationResultType } from "./validator.types.js";
export declare class ValidatorService {
    private readonly prisma;
    constructor(prisma: PrismaClient);
    validate(input: ValidationInput): Promise<{
        id: string;
    } & ValidationResultType>;
}
export declare function createValidatorService(prisma: PrismaClient): ValidatorService;
export declare function validatePacketPreSubmit(prisma: PrismaClient, params: {
    packetId: string;
    actor: string;
    playbookExecutionId?: string | null;
}): Promise<ValidationResultType & {
    validationResultId: string;
    packetId: string;
    caseId: string;
    payerId: string;
}>;
//# sourceMappingURL=validator.service.d.ts.map