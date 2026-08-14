export type StediConfig = {
  configured: boolean;
  apiKey?: string;
  mode: "test" | "production";
  eligibilityEnabled: boolean;
  claimsEnabled: boolean;
  attachmentsEnabled: boolean;
  statusEnabled: boolean;
  eraEnabled: boolean;
  autoPostEnabled: boolean;
  liveSubmissionEnabled: boolean;
  webhookSecret?: string;
  submitterId?: string;
  eligibilityFreshnessHours: number;
  claimStatusInitialDays: number;
  claimStatusRepeatDays: number;
};

function flag(name: string) {
  return String(process.env[name] || "").toLowerCase() === "true";
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getStediConfig(): StediConfig {
  const mode = process.env.STEDI_MODE === "production" ? "production" : "test";
  const apiKey = process.env.STEDI_API_KEY?.trim();
  return {
    configured: Boolean(apiKey),
    apiKey,
    mode,
    eligibilityEnabled: flag("STEDI_ENABLE_ELIGIBILITY"),
    claimsEnabled: flag("STEDI_ENABLE_CLAIMS"),
    attachmentsEnabled: flag("STEDI_ENABLE_ATTACHMENTS"),
    statusEnabled: flag("STEDI_ENABLE_STATUS"),
    eraEnabled: flag("STEDI_ENABLE_ERA"),
    autoPostEnabled: flag("STEDI_ENABLE_AUTO_POST"),
    liveSubmissionEnabled: mode === "production" && flag("STEDI_ENABLE_LIVE_SUBMISSION"),
    webhookSecret: process.env.STEDI_WEBHOOK_SECRET?.trim(),
    submitterId: process.env.STEDI_SUBMITTER_ID?.trim(),
    eligibilityFreshnessHours: numberEnv("STEDI_ELIGIBILITY_FRESHNESS_HOURS", 24),
    claimStatusInitialDays: numberEnv("CLAIM_STATUS_INITIAL_DAYS", 14),
    claimStatusRepeatDays: numberEnv("CLAIM_STATUS_REPEAT_DAYS", 7),
  };
}

export function publicStediStatus() {
  const config = getStediConfig();
  return {
    configured: config.configured,
    mode: config.mode,
    eligibilityEnabled: config.eligibilityEnabled,
    claimsEnabled: config.claimsEnabled,
    attachmentsEnabled: config.attachmentsEnabled,
    statusEnabled: config.statusEnabled,
    eraEnabled: config.eraEnabled,
    autoPostEnabled: config.autoPostEnabled,
    liveSubmissionEnabled: config.liveSubmissionEnabled,
  };
}

export function assertFeatureEnabled(feature: keyof Pick<StediConfig, "eligibilityEnabled" | "claimsEnabled" | "attachmentsEnabled" | "statusEnabled" | "eraEnabled">) {
  const config = getStediConfig();
  if (!config.configured) throw new Error("Stedi not configured");
  if (!config[feature]) throw new Error("Stedi feature disabled");
  if (feature === "claimsEnabled" && config.mode === "production" && !config.liveSubmissionEnabled) {
    throw new Error("Live Stedi claim submission disabled");
  }
  return config;
}
