import { z } from "zod";
export declare const documentGeneratorInputSchema: z.ZodObject<{
    patient: z.ZodObject<{
        firstName: z.ZodString;
        lastName: z.ZodString;
        dob: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        firstName: string;
        lastName: string;
        dob: string;
    }, {
        firstName: string;
        lastName: string;
        dob: string;
    }>;
    diagnosis: z.ZodOptional<z.ZodString>;
    device: z.ZodString;
    justification: z.ZodOptional<z.ZodString>;
    limitations: z.ZodOptional<z.ZodString>;
    failedTreatments: z.ZodOptional<z.ZodString>;
    physician: z.ZodObject<{
        name: z.ZodString;
        npi: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        npi?: string | undefined;
    }, {
        name: string;
        npi?: string | undefined;
    }>;
    hcpcs: z.ZodOptional<z.ZodString>;
    orderDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    patient: {
        firstName: string;
        lastName: string;
        dob: string;
    };
    device: string;
    physician: {
        name: string;
        npi?: string | undefined;
    };
    hcpcs?: string | undefined;
    diagnosis?: string | undefined;
    justification?: string | undefined;
    limitations?: string | undefined;
    failedTreatments?: string | undefined;
    orderDate?: string | undefined;
}, {
    patient: {
        firstName: string;
        lastName: string;
        dob: string;
    };
    device: string;
    physician: {
        name: string;
        npi?: string | undefined;
    };
    hcpcs?: string | undefined;
    diagnosis?: string | undefined;
    justification?: string | undefined;
    limitations?: string | undefined;
    failedTreatments?: string | undefined;
    orderDate?: string | undefined;
}>;
export type DocumentGeneratorInput = z.infer<typeof documentGeneratorInputSchema>;
export declare const generateAndSubmitPriorAuthBodySchema: z.ZodObject<{
    caseId: z.ZodString;
    input: z.ZodObject<{
        patient: z.ZodObject<{
            firstName: z.ZodString;
            lastName: z.ZodString;
            dob: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            firstName: string;
            lastName: string;
            dob: string;
        }, {
            firstName: string;
            lastName: string;
            dob: string;
        }>;
        diagnosis: z.ZodOptional<z.ZodString>;
        device: z.ZodString;
        justification: z.ZodOptional<z.ZodString>;
        limitations: z.ZodOptional<z.ZodString>;
        failedTreatments: z.ZodOptional<z.ZodString>;
        physician: z.ZodObject<{
            name: z.ZodString;
            npi: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            npi?: string | undefined;
        }, {
            name: string;
            npi?: string | undefined;
        }>;
        hcpcs: z.ZodOptional<z.ZodString>;
        orderDate: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        patient: {
            firstName: string;
            lastName: string;
            dob: string;
        };
        device: string;
        physician: {
            name: string;
            npi?: string | undefined;
        };
        hcpcs?: string | undefined;
        diagnosis?: string | undefined;
        justification?: string | undefined;
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
    }, {
        patient: {
            firstName: string;
            lastName: string;
            dob: string;
        };
        device: string;
        physician: {
            name: string;
            npi?: string | undefined;
        };
        hcpcs?: string | undefined;
        diagnosis?: string | undefined;
        justification?: string | undefined;
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    caseId: string;
    input: {
        patient: {
            firstName: string;
            lastName: string;
            dob: string;
        };
        device: string;
        physician: {
            name: string;
            npi?: string | undefined;
        };
        hcpcs?: string | undefined;
        diagnosis?: string | undefined;
        justification?: string | undefined;
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
    };
}, {
    caseId: string;
    input: {
        patient: {
            firstName: string;
            lastName: string;
            dob: string;
        };
        device: string;
        physician: {
            name: string;
            npi?: string | undefined;
        };
        hcpcs?: string | undefined;
        diagnosis?: string | undefined;
        justification?: string | undefined;
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
    };
}>;
export declare const clinicalInputSchema: z.ZodObject<{
    diagnosis: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        description?: string | undefined;
    }, {
        code: string;
        description?: string | undefined;
    }>, "many">;
    device: z.ZodObject<{
        category: z.ZodString;
        hcpcs: z.ZodOptional<z.ZodString>;
        manufacturer: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        quantity: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        category: string;
        hcpcs?: string | undefined;
        manufacturer?: string | undefined;
        model?: string | undefined;
        quantity?: number | undefined;
    }, {
        category: string;
        hcpcs?: string | undefined;
        manufacturer?: string | undefined;
        model?: string | undefined;
        quantity?: number | undefined;
    }>;
    physician: z.ZodObject<{
        name: z.ZodString;
        npi: z.ZodOptional<z.ZodString>;
        practice: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        npi?: string | undefined;
        practice?: string | undefined;
    }, {
        name: string;
        npi?: string | undefined;
        practice?: string | undefined;
    }>;
    clinicalSummaryLines: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    clinicalJustification: z.ZodOptional<z.ZodString>;
    limitations: z.ZodOptional<z.ZodString>;
    failedTreatments: z.ZodOptional<z.ZodString>;
    orderDate: z.ZodOptional<z.ZodString>;
    additionalNotes: z.ZodOptional<z.ZodString>;
    attachmentMetadata: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        label: string;
        mimeType?: string | undefined;
    }, {
        id: string;
        label: string;
        mimeType?: string | undefined;
    }>, "many">>;
    payerRuleProfileId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    diagnosis: {
        code: string;
        description?: string | undefined;
    }[];
    device: {
        category: string;
        hcpcs?: string | undefined;
        manufacturer?: string | undefined;
        model?: string | undefined;
        quantity?: number | undefined;
    };
    physician: {
        name: string;
        npi?: string | undefined;
        practice?: string | undefined;
    };
    limitations?: string | undefined;
    failedTreatments?: string | undefined;
    orderDate?: string | undefined;
    clinicalSummaryLines?: string[] | undefined;
    clinicalJustification?: string | undefined;
    additionalNotes?: string | undefined;
    attachmentMetadata?: {
        id: string;
        label: string;
        mimeType?: string | undefined;
    }[] | undefined;
    payerRuleProfileId?: string | undefined;
}, {
    diagnosis: {
        code: string;
        description?: string | undefined;
    }[];
    device: {
        category: string;
        hcpcs?: string | undefined;
        manufacturer?: string | undefined;
        model?: string | undefined;
        quantity?: number | undefined;
    };
    physician: {
        name: string;
        npi?: string | undefined;
        practice?: string | undefined;
    };
    limitations?: string | undefined;
    failedTreatments?: string | undefined;
    orderDate?: string | undefined;
    clinicalSummaryLines?: string[] | undefined;
    clinicalJustification?: string | undefined;
    additionalNotes?: string | undefined;
    attachmentMetadata?: {
        id: string;
        label: string;
        mimeType?: string | undefined;
    }[] | undefined;
    payerRuleProfileId?: string | undefined;
}>;
export declare const createPacketBodySchema: z.ZodObject<{
    caseId: z.ZodString;
    deviceType: z.ZodOptional<z.ZodString>;
    clinical: z.ZodObject<{
        diagnosis: z.ZodArray<z.ZodObject<{
            code: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            code: string;
            description?: string | undefined;
        }, {
            code: string;
            description?: string | undefined;
        }>, "many">;
        device: z.ZodObject<{
            category: z.ZodString;
            hcpcs: z.ZodOptional<z.ZodString>;
            manufacturer: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
            quantity: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        }, {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        }>;
        physician: z.ZodObject<{
            name: z.ZodString;
            npi: z.ZodOptional<z.ZodString>;
            practice: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        }, {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        }>;
        clinicalSummaryLines: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        clinicalJustification: z.ZodOptional<z.ZodString>;
        limitations: z.ZodOptional<z.ZodString>;
        failedTreatments: z.ZodOptional<z.ZodString>;
        orderDate: z.ZodOptional<z.ZodString>;
        additionalNotes: z.ZodOptional<z.ZodString>;
        attachmentMetadata: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            mimeType: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }, {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }>, "many">>;
        payerRuleProfileId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    }, {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    caseId: string;
    clinical: {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    };
    deviceType?: string | undefined;
}, {
    caseId: string;
    clinical: {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    };
    deviceType?: string | undefined;
}>;
export declare const generatePacketBodySchema: z.ZodObject<{
    clinical: z.ZodObject<{
        diagnosis: z.ZodArray<z.ZodObject<{
            code: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            code: string;
            description?: string | undefined;
        }, {
            code: string;
            description?: string | undefined;
        }>, "many">;
        device: z.ZodObject<{
            category: z.ZodString;
            hcpcs: z.ZodOptional<z.ZodString>;
            manufacturer: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
            quantity: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        }, {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        }>;
        physician: z.ZodObject<{
            name: z.ZodString;
            npi: z.ZodOptional<z.ZodString>;
            practice: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        }, {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        }>;
        clinicalSummaryLines: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        clinicalJustification: z.ZodOptional<z.ZodString>;
        limitations: z.ZodOptional<z.ZodString>;
        failedTreatments: z.ZodOptional<z.ZodString>;
        orderDate: z.ZodOptional<z.ZodString>;
        additionalNotes: z.ZodOptional<z.ZodString>;
        attachmentMetadata: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            mimeType: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }, {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }>, "many">>;
        payerRuleProfileId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    }, {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    clinical: {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    };
}, {
    clinical: {
        diagnosis: {
            code: string;
            description?: string | undefined;
        }[];
        device: {
            category: string;
            hcpcs?: string | undefined;
            manufacturer?: string | undefined;
            model?: string | undefined;
            quantity?: number | undefined;
        };
        physician: {
            name: string;
            npi?: string | undefined;
            practice?: string | undefined;
        };
        limitations?: string | undefined;
        failedTreatments?: string | undefined;
        orderDate?: string | undefined;
        clinicalSummaryLines?: string[] | undefined;
        clinicalJustification?: string | undefined;
        additionalNotes?: string | undefined;
        attachmentMetadata?: {
            id: string;
            label: string;
            mimeType?: string | undefined;
        }[] | undefined;
        payerRuleProfileId?: string | undefined;
    };
}>;
export declare const submitPacketPriorAuthBodySchema: z.ZodObject<{
    payload: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    payload: Record<string, any>;
}, {
    payload: Record<string, any>;
}>;
export type CreatePacketBody = z.infer<typeof createPacketBodySchema>;
export type GeneratePacketBody = z.infer<typeof generatePacketBodySchema>;
export type GenerateAndSubmitPriorAuthBody = z.infer<typeof generateAndSubmitPriorAuthBodySchema>;
//# sourceMappingURL=packet.d.ts.map