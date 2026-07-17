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
      aliases: ["Medicare", "Medicare Part B", "CMS Medicare"],
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
      product_components: ["Knee brace", "TENS support", "Compression garment"],
      hcpcs_codes: [
        { hcpcs: "L1833", description: "Knee orthosis", quantity: 1, modifier: "", laterality_rule: "required", required: true, source: "configured_kit", notes: "" },
        { hcpcs: "E0730", description: "TENS unit", quantity: 1, modifier: "", laterality_rule: "none", required: false, source: "configured_kit", notes: "Include only when supported by order/coverage." },
        { hcpcs: "A6531", description: "Compression garment", quantity: 1, modifier: "", laterality_rule: "when_applicable", required: false, source: "configured_kit", notes: "" },
      ],
      required_documents: ["source intake", "provider SWO", "medical necessity addendum", "POD"],
      payer_overrides: {},
      provider_overrides: {},
    }),
    rec("kit_hip_recovery_standard", {
      name: "Hip Recovery Standard Kit",
      carepath_id: "carepath_orthopedic_hip_recovery",
      description: "Configured hip recovery DME kit.",
      product_components: ["Hip orthosis", "TENS support", "Compression garment"],
      hcpcs_codes: [
        { hcpcs: "L1686", description: "Hip orthosis", quantity: 1, modifier: "", laterality_rule: "required", required: true, source: "configured_kit", notes: "" },
        { hcpcs: "E0730", description: "TENS unit", quantity: 1, modifier: "", laterality_rule: "none", required: false, source: "configured_kit", notes: "Include only when supported by order/coverage." },
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

export async function getMasterData() {
  const stored = await readMasterData();
  return {
    payers: stored.payers.length ? stored.payers : DEFAULT_MASTER_DATA.payers,
    providers: stored.providers.length ? stored.providers : DEFAULT_MASTER_DATA.providers,
    facilities: stored.facilities.length ? stored.facilities : DEFAULT_MASTER_DATA.facilities,
    carepaths: stored.carepaths.length ? stored.carepaths : DEFAULT_MASTER_DATA.carepaths,
    kits: stored.kits.length ? stored.kits : DEFAULT_MASTER_DATA.kits,
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
    const facility = facilities.find((row) => arr(npiMatch.facilities).includes(String(row.id)));
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
  const hcpcsComponents = Array.isArray(kit?.hcpcs_codes) ? kit.hcpcs_codes as Array<Record<string, unknown>> : [];
  return { carepath, kit, hcpcsComponents };
}
