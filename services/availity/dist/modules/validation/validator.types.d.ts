export type ValidationInput = {
    caseId?: string;
    payerId: string;
    planName?: string;
    deviceCategory?: string;
    hcpcsCode?: string;
    diagnosisCode?: string;
    packet: {
        attachments: Array<{
            type: string;
            content: string;
        }>;
        patient?: any;
        physician?: any;
    };
};
export type ValidationResultType = {
    status: "PASS" | "BLOCK" | "REVIEW";
    missingRequirements: string[];
    violations: string[];
    warnings: string[];
    recommendedActions: string[];
    explanation: string[];
};
//# sourceMappingURL=validator.types.d.ts.map