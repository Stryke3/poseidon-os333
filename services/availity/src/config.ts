import "dotenv/config";
import path from "node:path";

import { z } from "zod";

/** Default: `services/trident/manuals` when the process cwd is the `services/availity` package. */
export function defaultTridentManualsRoot(): string {
  return path.resolve(process.cwd(), "..", "trident", "manuals");
}

const emptyStringToUndefined = (v: unknown): unknown => {
  if (v === undefined || v === null) return v
  if (typeof v === "string" && v.trim() === "") return undefined
  return v
}

const strEnv = z.preprocess((v) => (v === undefined || v === null ? "" : String(v)), z.string())

const availityEnvSchema = z.object({
  // Defaults allow the service to boot even when Availity OAuth integration env vars are blank
  // (useful for non-Availity features like denials-to-appeals automation).
  AVAILITY_BASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default("https://api.availity.com"),
  ),
  AVAILITY_TOKEN_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default("https://api.availity.com/v1/token"),
  ),
  AVAILITY_CLIENT_ID: strEnv,
  AVAILITY_CLIENT_SECRET: strEnv,
  AVAILITY_SCOPE: z.string().optional().default(""),
  AVAILITY_ELIGIBILITY_PATH: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional().default("/v1/coverages/eligibility"),
  ),
  AVAILITY_PRIOR_AUTH_PATH: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional().default("/v1/authorizations"),
  ),
  AVAILITY_TIMEOUT_MS: z.coerce.number().default(30000),
  NODE_ENV: z.string().optional(),
});

const appEnvSchema = z.object({
  PORT: z.coerce.number().default(8005),
  DATABASE_URL: z.string().min(1),
  MANUAL_EXTRACTION_LLM: z
    .preprocess((v) => String(v ?? "").toLowerCase(), z.enum(["", "true", "false"]))
    .optional(),
  MANUAL_EXTRACTION_OPENAI_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

const fullSchema = availityEnvSchema.merge(appEnvSchema);

const parsed = fullSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.message}`,
  );
}

const env = parsed.data;

/** Availity-only config (validated subset). */
export const availityConfig = {
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
export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV ?? "development",

  availity: {
    baseUrl: availityConfig.baseUrl,
    tokenUrl: availityConfig.tokenUrl,
    clientId: availityConfig.clientId,
    clientSecret: availityConfig.clientSecret,
    scope: availityConfig.scope,
    eligibilityPath: availityConfig.eligibilityPath,
    priorAuthPath: availityConfig.priorAuthPath,
    timeoutMs: availityConfig.timeoutMs,
  },

  databaseUrl: env.DATABASE_URL,

  governance: {
    tridentManualsRoot: process.env.TRIDENT_MANUALS_PATH?.trim()
      ? path.resolve(process.env.TRIDENT_MANUALS_PATH.trim())
      : defaultTridentManualsRoot(),
  },

  manualExtraction: {
    llmEnabled: String(process.env.MANUAL_EXTRACTION_LLM ?? "").toLowerCase() === "true",
    openaiModel: process.env.MANUAL_EXTRACTION_OPENAI_MODEL?.trim() || "gpt-4o-mini",
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  },
} as const;
