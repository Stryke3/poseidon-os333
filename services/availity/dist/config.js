"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.availityConfig = void 0;
exports.defaultTridentManualsRoot = defaultTridentManualsRoot;
require("dotenv/config");
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
/** Default: `services/trident/manuals` when the process cwd is the `services/availity` package. */
function defaultTridentManualsRoot() {
    return node_path_1.default.resolve(process.cwd(), "..", "trident", "manuals");
}
const strEnv = zod_1.z.preprocess((v) => (v === undefined || v === null ? "" : String(v)), zod_1.z.string());
const availityEnvSchema = zod_1.z.object({
    AVAILITY_BASE_URL: zod_1.z.string().url(),
    AVAILITY_TOKEN_URL: zod_1.z.string().url(),
    AVAILITY_CLIENT_ID: strEnv,
    AVAILITY_CLIENT_SECRET: strEnv,
    AVAILITY_SCOPE: zod_1.z.string().min(1),
    AVAILITY_ELIGIBILITY_PATH: zod_1.z.string().min(1),
    AVAILITY_PRIOR_AUTH_PATH: zod_1.z.string().min(1),
    AVAILITY_TIMEOUT_MS: zod_1.z.coerce.number().default(30000),
    NODE_ENV: zod_1.z.string().optional(),
});
const appEnvSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(8005),
    DATABASE_URL: zod_1.z.string().min(1),
    MANUAL_EXTRACTION_LLM: zod_1.z
        .preprocess((v) => String(v ?? "").toLowerCase(), zod_1.z.enum(["", "true", "false"]))
        .optional(),
    MANUAL_EXTRACTION_OPENAI_MODEL: zod_1.z.string().optional(),
    OPENAI_API_KEY: zod_1.z.string().optional(),
});
const fullSchema = availityEnvSchema.merge(appEnvSchema);
const parsed = fullSchema.safeParse(process.env);
if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}
const env = parsed.data;
/** Availity-only config (validated subset). */
exports.availityConfig = {
    baseUrl: env.AVAILITY_BASE_URL,
    tokenUrl: env.AVAILITY_TOKEN_URL,
    clientId: env.AVAILITY_CLIENT_ID,
    clientSecret: env.AVAILITY_CLIENT_SECRET,
    scope: env.AVAILITY_SCOPE,
    eligibilityPath: env.AVAILITY_ELIGIBILITY_PATH,
    priorAuthPath: env.AVAILITY_PRIOR_AUTH_PATH,
    timeoutMs: env.AVAILITY_TIMEOUT_MS,
    isProduction: env.NODE_ENV === "production",
};
/** Full service config (existing shape for imports). */
exports.config = {
    port: env.PORT,
    nodeEnv: env.NODE_ENV ?? "development",
    availity: {
        baseUrl: exports.availityConfig.baseUrl,
        tokenUrl: exports.availityConfig.tokenUrl,
        clientId: exports.availityConfig.clientId,
        clientSecret: exports.availityConfig.clientSecret,
        scope: exports.availityConfig.scope,
        eligibilityPath: exports.availityConfig.eligibilityPath,
        priorAuthPath: exports.availityConfig.priorAuthPath,
        timeoutMs: exports.availityConfig.timeoutMs,
    },
    databaseUrl: env.DATABASE_URL,
    governance: {
        tridentManualsRoot: process.env.TRIDENT_MANUALS_PATH?.trim()
            ? node_path_1.default.resolve(process.env.TRIDENT_MANUALS_PATH.trim())
            : defaultTridentManualsRoot(),
    },
    manualExtraction: {
        llmEnabled: String(process.env.MANUAL_EXTRACTION_LLM ?? "").toLowerCase() === "true",
        openaiModel: process.env.MANUAL_EXTRACTION_OPENAI_MODEL?.trim() || "gpt-4o-mini",
        openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
    },
};
//# sourceMappingURL=config.js.map