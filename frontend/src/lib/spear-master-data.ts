import { readMasterData, writeMasterData, type SpearMasterData } from "@/lib/poseidon-store";

export type MatchStatus = "exact" | "alias" | "fuzzy" | "operator_selected" | "unmatched";

export type NormalizedPayer = {
  raw_value: string;
  canonical_payer_id: string;
  canonical_name: string;
  matched_alias: string;
  confidence: number;
  match_status: MatchStatus;
};

export type NormalizedProviderFacility = {
  facility: {
    raw_value: string;
    facility_id: string;
    canonical_name: string;
    confidence: number;
    match_status: MatchStatus;
  };
  provider: {
    raw_value: string;
    provider_id: string;
    display_name: string;
    npi: string;
    confidence: number;
    match_status: MatchStatus;
    match_reason: string;
    setup_status?: string;
  };
};

const NOW = "2026-07-16T00:00:00.000Z";
const KNEE_RECOVERY_KIT_COMPONENTS: Array<Record<string, unknown>> = [
  {
    code: "L1833",
    hcpcs: "L1833",
    description: "Knee orthosis",
    quantity: 1,
    modifier: "",
    laterality_rule: "required",
    required: true,
    source: "configured_kit",
    notes: "Core knee recovery brace line. Requires supported order and diagnosis pointer.",
  },
  {
    code: "E0676",
    hcpcs: "E0676",
    description: "Intermittent limb compression device / DVT cold-flow support",
    quantity: 1,
    modifier: "",
    laterality_rule: "when_applicable",
    required: false,
    source: "configured_kit",
    payer_policy: "commercial_only",
    excluded_payer_types: ["medicare", "medicaid"],
    requires_noc_narrative: true,
    noc_narrative: "DVT prophylaxis and post-operative edema control support requested as part of the knee recovery pathway; commercial coverage requires payer-specific medical necessity review and claim-line narrative.",
    notes: "Commercial/private payer review only. Never recommend for Medicare or Medicaid billing.",
  },
  {
    code: "E0730",
    hcpcs: "E0730",
    description: "TENS unit",
    quantity: 1,
    modifier: "",
    laterality_rule: "none",
    required: false,
    source: "configured_kit",
    notes: "Include only when supported by order, symptoms, and payer coverage.",
  },
  {
    code: "A6531",
    hcpcs: "A6531",
    description: "Compression garment or device support",
    quantity: 1,
    modifier: "",
    laterality_rule: "when_applicable",
    required: false,
    source: "configured_kit",
    notes: "Compression support for edema management when documentation and payer policy allow.",
  },
  {
    code: "E0218",
    hcpcs: "E0218",
    description: "Cold therapy / icing support",
    quantity: 1,
    modifier: "",
    laterality_rule: "when_applicable",
    required: false,
    source: "configured_kit",
    payer_policy: "payer_review",
    requires_policy_check: true,
    notes: "Icing support line for payer review. Include only when supported by order and plan policy.",
  },
];

function rec(id: string, extra: Record<string, unknown>) {
  return { id, active: true, created_at: NOW, updated_at: NOW, ...extra };
}

export const DEFAULT_MASTER_DATA: SpearMasterData = {
  payers: [
    rec("payer_unitedhealthcare", {
      canonical_name: "UnitedHealthcare",
      display_name: "UnitedHealthcare",
      payer_type: "commercial",
      payer_id: "",
      aliases: ["United Healthcare", "UnitedHealthcare", "UHC", "U.H.C.", "United Health Care", "UHC Commercial", "UHC Medicare Advantage"],
      notes: "Default SPEAR payer normalization record.",
    }),
    rec("payer_aetna", {
      canonical_name: "Aetna",
      display_name: "Aetna",
      payer_type: "commercial",
      payer_id: "",
      aliases: ["Aetna", "Aetna Health", "Aetna Medicare", "Aetna Better Health"],
      notes: "Default SPEAR payer normalization record.",
    }),
    rec("payer_medicare", {
      canonical_name: "Medicare",
      display_name: "Medicare",
      payer_type: "medicare",
      payer_id: "",
      aliases: ["Medicare", "Medicare Part B", "CMS Medicare", "Medicare Of Nevada", "MEDICARE_OF_NEVADA"],
      notes: "Default SPEAR payer normalization record.",
    }),
    rec("payer_medicaid", {
      canonical_name: "Medicaid",
      display_name: "Medicaid",
      payer_type: "medicaid",
      payer_id: "",
      aliases: ["Medicaid"],
      notes: "State/program distinctions should be preserved when known.",
    }),
  ],
  providers: [
    rec("provider_brian_carr", {
      first_name: "Brian",
      last_name: "Carr",
      display_name: "Dr. Brian Carr",
      credentials: "MD",
      npi: "",
      specialty: "Orthopedics",
      facility_ids: ["facility_lvco"],
      facilities: ["facility_lvco"],
      aliases: ["Brian Carr", "Dr Brian Carr", "Dr. Carr", "Carr"],
      notes: "Local repository/config search found LVCO references but no saved Brian Carr NPI. Setup required; do not infer NPI.",
      source_provenance: "local repository search; NPI not found",
      setup_status: "npi_required",
    }),
  ],
  facilities: [
    rec("facility_lvco", {
      canonical_name: "Las Vegas Concierge Orthopedics",
      aliases: ["LVCO", "Las Vegas Concierge Ortho", "Las Vegas Concierge Orthopaedics", "Las Vegas Concierge Orthopedics", "Concierge Orthopedics"],
      address: "",
      phone: "",
      fax: "",
      provider_ids: ["provider_brian_carr"],
      default_provider_id: "provider_brian_carr",
      notes: "Default provider relationship is enabled for LVCO intake matching; provider NPI remains setup-incomplete until entered in Settings.",
    }),
  ],
  carepaths: [
    rec("carepath_orthopedic_knee_recovery", {
      name: "Orthopedic Knee Recovery",
      description: "Knee bracing and recovery support pathway.",
      applicable_diagnoses: ["M17", "M25.56", "S83"],
      applicable_procedures: ["knee", "tka", "arthroplasty", "brace"],
      applicable_laterality: ["left", "right", "bilateral"],
      kit_ids: ["kit_knee_recovery_standard"],
    }),
    rec("carepath_orthopedic_hip_recovery", {
      name: "Orthopedic Hip Recovery",
      description: "Hip bracing and recovery support pathway.",
      applicable_diagnoses: ["M16", "M25.55", "S73"],
      applicable_procedures: ["hip", "tha", "arthroplasty"],
      applicable_laterality: ["left", "right", "bilateral"],
      kit_ids: ["kit_hip_recovery_standard"],
    }),
    rec("carepath_maternity", {
      name: "Maternity CarePath",
      description: "Mommy CarePathway support kit.",
      applicable_diagnoses: ["O", "Z34", "Z3A"],
      applicable_procedures: ["maternity", "pregnancy", "postpartum"],
      applicable_laterality: [],
      kit_ids: ["kit_maternity_support"],
    }),
  ],
  kits: [
    rec("kit_knee_recovery_standard", {
      name: "Knee Recovery Standard Kit",
      carepath_id: "carepath_orthopedic_knee_recovery",
      description: "Configured knee recovery DME kit.",
      product_components: ["Knee brace", "DVT cold-flow/compression support", "TENS support", "Compression garment/device", "Cold therapy / icing support"],
      hcpcs_codes: KNEE_RECOVERY_KIT_COMPONENTS,
      required_documents: ["source intake", "provider SWO", "medical necessity addendum", "POD"],
      payer_overrides: {
        commercial: { include: ["L1833", "E0676", "E0730", "A6531", "E0218"], requires_policy_review: ["E0676", "E0218"] },
        medicare: { exclude: ["E0676"], review_optional: ["E0730", "A6531", "E0218"] },
        medicaid: { exclude: ["E0676"], review_optional: ["E0730", "A6531", "E0218"] },
      },
      provider_overrides: {},
    }),
    rec("kit_hip_recovery_standard", {
      name: "Hip Recovery Standard Kit",
      carepath_id: "carepath_orthopedic_hip_recovery",
      description: "Configured hip recovery DME kit.",
      product_components: ["Hip orthosis", "TENS support", "Compression garment"],
      hcpcs_codes: [
        { code: "L1686", hcpcs: "L1686", description: "Hip orthosis", quantity: 1, modifier: "", laterality_rule: "required", required: true, source: "configured_kit", notes: "" },
        { code: "E0730", hcpcs: "E0730", description: "TENS unit", quantity: 1, modifier: "", laterality_rule: "none", required: false, source: "configured_kit", notes: "Include only when supported by order/coverage." },
      ],
      required_documents: ["source intake", "provider SWO", "medical necessity addendum", "POD"],
      payer_overrides: {},
      provider_overrides: {},
    }),
    rec("kit_maternity_support", {
      name: "Mommy CarePathway Kit",
      carepath_id: "carepath_maternity",
      description: "Configured maternity CarePath kit lane.",
      product_components: ["Maternity support pathway"],
      hcpcs_codes: [],
      required_documents: ["source intake", "provider order"],
      payer_overrides: {},
      provider_overrides: {},
    }),
  ],
  code_sets: [],
  unmatched_payers: [],
};

function norm(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokens(value: unknown) {
  return new Set(norm(value).split(" ").filter(Boolean));
}

function tokenScore(a: unknown, b: unknown) {
  const at = tokens(a);
  const bt = tokens(b);
  if (!at.size || !bt.size) return 0;
  const intersection = Array.from(at).filter((item) => bt.has(item)).length;
  return intersection / Math.max(at.size, bt.size);
}

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function componentCode(component: Record<string, unknown>) {
  return String(component.hcpcs || component.code || "").trim().toUpperCase();
}

function normalizeKitComponent(component: Record<string, unknown>) {
  const code = String(component.code || component.hcpcs || "").trim().toUpperCase();
  return { ...component, code, hcpcs: String(component.hcpcs || code).trim().toUpperCase() };
}

function normalizeProviderRows(providers: Array<Record<string, unknown>>) {
  return providers.map((provider) => {
    const facilityIds = arr(provider.facility_ids);
    const legacyFacilityIds = arr(provider.facilities);
    return {
      ...provider,
      facility_ids: facilityIds.length ? facilityIds : legacyFacilityIds,
      facilities: legacyFacilityIds.length ? legacyFacilityIds : facilityIds,
    };
  });
}

function normalizeKitRows(kits: Array<Record<string, unknown>>) {
  return kits.map((kit) => {
    const existing = Array.isArray(kit.hcpcs_codes)
      ? (kit.hcpcs_codes as Array<Record<string, unknown>>).map(normalizeKitComponent)
      : [];
    if (String(kit.id) !== "kit_knee_recovery_standard") {
      return { ...kit, hcpcs_codes: existing };
    }

    const byCode = new Map(existing.map((component) => [componentCode(component), component]));
    for (const builtIn of KNEE_RECOVERY_KIT_COMPONENTS.map(normalizeKitComponent)) {
      const code = componentCode(builtIn);
      byCode.set(code, { ...builtIn, ...(byCode.get(code) || {}) });
    }
    const productComponents = Array.from(new Set([
      ...arr(kit.product_components),
      "Knee brace",
      "DVT cold-flow/compression support",
      "TENS support",
      "Compression garment/device",
      "Cold therapy / icing support",
    ]));
    return {
      ...kit,
      product_components: productComponents,
      hcpcs_codes: Array.from(byCode.values()),
      payer_overrides: {
        commercial: { include: ["L1833", "E0676", "E0730", "A6531", "E0218"], requires_policy_review: ["E0676", "E0218"] },
        medicare: { exclude: ["E0676"], review_optional: ["E0730", "A6531", "E0218"] },
        medicaid: { exclude: ["E0676"], review_optional: ["E0730", "A6531", "E0218"] },
        ...(kit.payer_overrides && typeof kit.payer_overrides === "object" ? kit.payer_overrides : {}),
      },
    };
  });
}

export async function getMasterData() {
  const stored = await readMasterData();
  return {
    payers: stored.payers.length ? stored.payers : DEFAULT_MASTER_DATA.payers,
    providers: normalizeProviderRows(stored.providers.length ? stored.providers : DEFAULT_MASTER_DATA.providers),
    facilities: stored.facilities.length ? stored.facilities : DEFAULT_MASTER_DATA.facilities,
    carepaths: stored.carepaths.length ? stored.carepaths : DEFAULT_MASTER_DATA.carepaths,
    kits: normalizeKitRows(stored.kits.length ? stored.kits : DEFAULT_MASTER_DATA.kits),
    code_sets: stored.code_sets.length ? stored.code_sets : DEFAULT_MASTER_DATA.code_sets,
    unmatched_payers: stored.unmatched_payers || [],
  };
}

export async function saveMasterData(masterData: SpearMasterData) {
  return writeMasterData(masterData);
}

export function normalizePayer(rawValue: string, masterData: SpearMasterData): NormalizedPayer {
  const raw = rawValue || "";
  const active = masterData.payers.filter((payer) => payer.active !== false);
  const rawNorm = norm(raw);
  for (const payer of active) {
    const canonical = String(payer.canonical_name || payer.display_name || "");
    if (norm(canonical) === rawNorm && rawNorm) {
      return { raw_value: raw, canonical_payer_id: String(payer.id), canonical_name: canonical, matched_alias: canonical, confidence: 1, match_status: "exact" };
    }
  }
  for (const payer of active) {
    const alias = arr(payer.aliases).find((item) => norm(item) === rawNorm && rawNorm);
    if (alias) {
      return { raw_value: raw, canonical_payer_id: String(payer.id), canonical_name: String(payer.canonical_name || payer.display_name || alias), matched_alias: alias, confidence: 0.97, match_status: "alias" };
    }
  }
  const scored = active
    .map((payer) => {
      const candidates = [payer.canonical_name, payer.display_name, ...arr(payer.aliases)];
      const best = Math.max(...candidates.map((candidate) => tokenScore(raw, candidate)));
      return { payer, best };
    })
    .sort((a, b) => b.best - a.best)[0];
  if (scored && scored.best >= 0.75) {
    return {
      raw_value: raw,
      canonical_payer_id: String(scored.payer.id),
      canonical_name: String(scored.payer.canonical_name || scored.payer.display_name || ""),
      matched_alias: "",
      confidence: Math.min(0.94, scored.best),
      match_status: "fuzzy",
    };
  }
  return { raw_value: raw, canonical_payer_id: "", canonical_name: raw, matched_alias: "", confidence: raw ? 0.2 : 0, match_status: "unmatched" };
}

export function normalizeProviderFacility(input: {
  facility_name_raw?: string;
  provider_name_raw?: string;
  provider_npi_raw?: string;
}, masterData: SpearMasterData): NormalizedProviderFacility {
  const providerRaw = input.provider_name_raw || "";
  const facilityRaw = input.facility_name_raw || "";
  const npiRaw = input.provider_npi_raw || "";
  const providers = masterData.providers.filter((provider) => provider.active !== false);
  const facilities = masterData.facilities.filter((facility) => facility.active !== false);
  const emptyFacility = { raw_value: facilityRaw, facility_id: "", canonical_name: "", confidence: 0, match_status: "unmatched" as MatchStatus };
  const emptyProvider = { raw_value: providerRaw, provider_id: "", display_name: "", npi: "", confidence: 0, match_status: "unmatched" as MatchStatus, match_reason: "No provider match" };

  const npiMatch = npiRaw ? providers.find((provider) => String(provider.npi || "") === npiRaw) : undefined;
  if (npiMatch) {
    const relatedFacilityIds = [...arr(npiMatch.facility_ids), ...arr(npiMatch.facilities)];
    const facility = facilities.find((row) => relatedFacilityIds.includes(String(row.id)));
    return {
      facility: facility ? { raw_value: facilityRaw, facility_id: String(facility.id), canonical_name: String(facility.canonical_name), confidence: 0.9, match_status: facilityRaw ? "exact" : "operator_selected" } : emptyFacility,
      provider: { raw_value: providerRaw, provider_id: String(npiMatch.id), display_name: String(npiMatch.display_name), npi: String(npiMatch.npi || ""), confidence: 1, match_status: "exact", match_reason: "Exact NPI match" },
    };
  }

  const providerNameNorm = norm(providerRaw);
  const providerMatch = providers.find((provider) => providerNameNorm && norm(provider.display_name) === providerNameNorm)
    || providers.find((provider) => providerNameNorm && arr(provider.aliases).some((alias) => norm(alias) === providerNameNorm));

  const facilityNorm = norm(facilityRaw);
  const facilityMatch = facilities.find((facility) => facilityNorm && norm(facility.canonical_name) === facilityNorm)
    || facilities.find((facility) => facilityNorm && arr(facility.aliases).some((alias) => norm(alias) === facilityNorm));

  const relatedProvider = providerMatch || (facilityMatch?.default_provider_id
    ? providers.find((provider) => String(provider.id) === String(facilityMatch.default_provider_id))
    : undefined);

  return {
    facility: facilityMatch
      ? { raw_value: facilityRaw, facility_id: String(facilityMatch.id), canonical_name: String(facilityMatch.canonical_name), confidence: 0.97, match_status: norm(facilityMatch.canonical_name) === facilityNorm ? "exact" : "alias" }
      : emptyFacility,
    provider: relatedProvider
      ? {
          raw_value: providerRaw,
          provider_id: String(relatedProvider.id),
          display_name: String(relatedProvider.display_name),
          npi: String(relatedProvider.npi || ""),
          confidence: providerMatch ? 0.96 : 0.9,
          match_status: providerMatch ? "alias" : "operator_selected",
          match_reason: providerMatch ? "Provider registry match" : "Matched through facility default-provider relationship",
          setup_status: String(relatedProvider.npi || "") ? "complete" : "npi_required",
        }
      : emptyProvider,
  };
}

export type TridentPayerType = "commercial" | "medicare" | "medicaid" | "unknown";

export function classifyPayerType(caseRecord: Record<string, unknown>, masterData: SpearMasterData): TridentPayerType {
  const payerId = String(caseRecord.canonical_payer_id || caseRecord.payer_id || "").trim();
  const matchedPayer = payerId ? masterData.payers.find((payer) => String(payer.id) === payerId) : undefined;
  const haystack = [
    caseRecord.payer,
    caseRecord.canonical_payer,
    caseRecord.raw_payer,
    caseRecord.payer_id,
    caseRecord.canonical_payer_id,
    (caseRecord.payer_normalization as Record<string, unknown> | undefined)?.canonical_name,
    (caseRecord.payer_normalization as Record<string, unknown> | undefined)?.raw_value,
    matchedPayer?.canonical_name,
    matchedPayer?.display_name,
    matchedPayer?.payer_type,
  ].map((value) => norm(value)).join(" ");

  if (/\bmedicaid\b/.test(haystack)) return "medicaid";
  if (/\bmedicare\b|\bcms\b|\bpart b\b/.test(haystack)) return "medicare";
  const matchedType = norm(matchedPayer?.payer_type);
  if (matchedType === "commercial") return "commercial";
  if (/\bcigna\b|\bunited\b|\buhc\b|\baetna\b|\banthem\b|\bbcbs\b|\bblue cross\b|\bcommercial\b|\bppo\b|\bhmo\b/.test(haystack)) return "commercial";
  return "unknown";
}

function componentAllowedForPayer(component: Record<string, unknown>, payerType: TridentPayerType) {
  const policy = norm(component.payer_policy);
  const excluded = arr(component.excluded_payer_types).map(norm);
  if (policy === "commercial only" && payerType !== "commercial") return false;
  if (excluded.includes(payerType)) return false;
  return true;
}

export function recommendConfiguredKit(caseRecord: Record<string, unknown>, masterData: SpearMasterData) {
  const text = [
    caseRecord.product,
    caseRecord.order_type,
    caseRecord.raw_text,
    caseRecord.notes,
    caseRecord.source_icd,
    caseRecord.icd,
  ].map((value) => Array.isArray(value) ? value.join(" ") : String(value || "")).join(" ").toLowerCase();
  const carepath = masterData.carepaths.find((row) => {
    const terms = [...arr(row.applicable_diagnoses), ...arr(row.applicable_procedures)];
    return terms.some((term) => text.includes(String(term).toLowerCase()));
  }) || masterData.carepaths.find((row) => row.id === "carepath_orthopedic_knee_recovery") || masterData.carepaths[0];
  const kit = masterData.kits.find((row) => String(row.carepath_id) === String(carepath?.id) && row.active !== false) || masterData.kits[0];
  const payerType = classifyPayerType(caseRecord, masterData);
  const allComponents = Array.isArray(kit?.hcpcs_codes) ? kit.hcpcs_codes as Array<Record<string, unknown>> : [];
  const hcpcsComponents = allComponents.filter((component) => componentAllowedForPayer(component, payerType));
  const excludedComponents = allComponents.filter((component) => !componentAllowedForPayer(component, payerType));
  return { carepath, kit, hcpcsComponents, excludedComponents, payerType };
}
