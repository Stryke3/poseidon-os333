import "dotenv/config";
/** Default: `services/trident/manuals` when the process cwd is the `services/availity` package. */
export declare function defaultTridentManualsRoot(): string;
/** Availity-only config (validated subset). */
export declare const availityConfig: {
    baseUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    eligibilityPath: string;
    priorAuthPath: string;
    timeoutMs: number;
    isProduction: boolean;
};
/** Full service config (existing shape for imports). */
export declare const config: {
    readonly port: number;
    readonly nodeEnv: string;
    readonly availity: {
        readonly baseUrl: string;
        readonly tokenUrl: string;
        readonly clientId: string;
        readonly clientSecret: string;
        readonly scope: string;
        readonly eligibilityPath: string;
        readonly priorAuthPath: string;
        readonly timeoutMs: number;
    };
    readonly databaseUrl: string;
    readonly governance: {
        readonly tridentManualsRoot: string;
    };
    readonly manualExtraction: {
        readonly llmEnabled: boolean;
        readonly openaiModel: string;
        readonly openaiApiKey: string;
    };
};
//# sourceMappingURL=config.d.ts.map