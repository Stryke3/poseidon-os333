"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractLlmManualRequirementCandidates = extractLlmManualRequirementCandidates;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const config_js_1 = require("../../config.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
const requirementTypeEnum = zod_1.z.enum([
    governance_constants_js_1.REQUIREMENT_TYPE.REQUIRED_DOCUMENT,
    governance_constants_js_1.REQUIREMENT_TYPE.AUTH_REQUIRED,
    governance_constants_js_1.REQUIREMENT_TYPE.RESTRICTION,
    governance_constants_js_1.REQUIREMENT_TYPE.TIMING_RULE,
    governance_constants_js_1.REQUIREMENT_TYPE.ESCALATION,
]);
const llmResponseSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({
        requirementType: requirementTypeEnum,
        requirementValue: zod_1.z.string().min(1),
        /** Verbatim substring copied from the manual (no paraphrase). */
        sourceExcerpt: zod_1.z.string().min(1),
        confidence: zod_1.z.number().min(0).max(1).optional(),
    })),
});
function excerptAppearsInManual(manualText, excerpt) {
    const e = excerpt.trim();
    if (e.length < 3)
        return false;
    return manualText.includes(e);
}
function stableLlmKey(requirementType, requirementValue, excerpt) {
    const basis = `${requirementType}:${requirementValue}:${excerpt.slice(0, 500)}`;
    return `llm:${(0, node_crypto_1.createHash)("sha256").update(basis, "utf8").digest("hex").slice(0, 20)}`;
}
/**
 * LLM-assisted candidates only — always `PENDING_REVIEW` / inactive until a human promotes them.
 * Requires `MANUAL_EXTRACTION_LLM=true` and `OPENAI_API_KEY`.
 */
async function extractLlmManualRequirementCandidates(manualText) {
    const apiKey = config_js_1.config.manualExtraction.openaiApiKey;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY_REQUIRED_FOR_MANUAL_EXTRACTION_LLM");
    }
    const truncated = manualText.length > 120_000 ? manualText.slice(0, 120_000) : manualText;
    const system = `You extract structured payer policy requirements from manual text.
Return JSON only with shape: {"items":[{"requirementType","requirementValue","sourceExcerpt","confidence"}]}.
requirementType must be one of: REQUIRED_DOCUMENT, AUTH_REQUIRED, RESTRICTION, TIMING_RULE, ESCALATION.
REQUIRED_DOCUMENT = specific documents to submit; AUTH_REQUIRED = prior auth / notification; RESTRICTION = clinical / coding / coverage limits; TIMING_RULE = deadlines or windows; ESCALATION = appeals / peer / grievance.
sourceExcerpt MUST be copied verbatim from the manual (a contiguous substring). requirementValue is a short structured summary (plain language).
confidence 0-1 optional. Do not invent policy; if unsure, omit the item.`;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: config_js_1.config.manualExtraction.openaiModel,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                {
                    role: "user",
                    content: `Manual text:\n\n${truncated}`,
                },
            ],
        }),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OPENAI_MANUAL_EXTRACT_FAILED: ${res.status} ${errText.slice(0, 400)}`);
    }
    const json = (await res.json());
    const raw = json.choices?.[0]?.message?.content;
    if (!raw)
        throw new Error("OPENAI_MANUAL_EXTRACT_EMPTY");
    let parsed;
    try {
        parsed = llmResponseSchema.parse(JSON.parse(raw));
    }
    catch {
        throw new Error("OPENAI_MANUAL_EXTRACT_INVALID_JSON");
    }
    const out = [];
    for (const item of parsed.items) {
        if (!excerptAppearsInManual(manualText, item.sourceExcerpt))
            continue;
        const conf = item.confidence != null ? Math.min(0.79, item.confidence) : 0.55;
        out.push({
            requirementType: item.requirementType,
            requirementKey: stableLlmKey(item.requirementType, item.requirementValue, item.sourceExcerpt),
            requirementValue: item.requirementValue,
            sourceExcerpt: item.sourceExcerpt.trim(),
            confidence: conf,
            hcpcsCode: null,
            diagnosisCode: null,
            deviceCategory: null,
            reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW,
            extractionSource: governance_constants_js_1.MANUAL_EXTRACTION_SOURCE.LLM,
            active: false,
        });
    }
    return out;
}
//# sourceMappingURL=manualRequirement.llm.js.map