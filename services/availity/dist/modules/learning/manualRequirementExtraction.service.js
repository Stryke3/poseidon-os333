"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractManualRequirementCandidates = extractManualRequirementCandidates;
exports.persistManualRequirementExtractions = persistManualRequirementExtractions;
const config_js_1 = require("../../config.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
const manual_requirement_extractor_js_1 = require("../governance/manual-requirement-extractor.js");
const manualRequirement_llm_js_1 = require("./manualRequirement.llm.js");
const manualRequirement_mapper_js_1 = require("./manualRequirement.mapper.js");
function deterministicToCandidates(rows, opts = {}) {
    // Enforce excerpt traceability: deterministic extractor may theoretically emit null/empty excerpts.
    return rows
        .filter((r) => typeof r.sourceExcerpt === "string" && r.sourceExcerpt.trim().length > 0)
        .map((r) => {
        const conf = r.confidence ?? 0;
        const auto = opts.reviewOnly === true
            ? governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW
            : conf >= governance_constants_js_1.MANUAL_EXTRACTION_AUTO_ACCEPT_CONFIDENCE
                ? governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT
                : governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW;
        return {
            ...r,
            sourceExcerpt: r.sourceExcerpt,
            reviewState: auto,
            extractionSource: governance_constants_js_1.MANUAL_EXTRACTION_SOURCE.DETERMINISTIC,
            active: opts.reviewOnly === true
                ? false
                : auto === governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT,
        };
    });
}
function excerptsRoughlyOverlap(a, b) {
    const x = a.trim().toLowerCase();
    const y = b.trim().toLowerCase();
    if (x.length < 16 || y.length < 16)
        return x === y;
    return x.includes(y.slice(0, 24)) || y.includes(x.slice(0, 24));
}
function filterLlmAgainstDeterministic(det, llm) {
    const excerpts = det.map((d) => d.sourceExcerpt ?? "").filter(Boolean);
    return llm.filter((item) => {
        const ex = item.sourceExcerpt ?? "";
        if (!ex)
            return false;
        return !excerpts.some((d) => excerptsRoughlyOverlap(d, ex));
    });
}
function hasTraceableExcerpt(rawText, excerpt) {
    const ex = excerpt?.trim();
    if (!ex || ex.length < 3)
        return false;
    return rawText.includes(ex);
}
/**
 * Deterministic regex extraction plus optional LLM candidates (feature-flagged).
 * LLM rows are never auto-accepted for production use.
 */
async function extractManualRequirementCandidates(rawText, opts = {}) {
    const det = deterministicToCandidates((0, manual_requirement_extractor_js_1.extractRequirementsFromManualText)(rawText), {
        reviewOnly: opts.reviewOnly,
    });
    if (!opts.useLlm || !config_js_1.config.manualExtraction.llmEnabled)
        return det;
    if (!config_js_1.config.manualExtraction.openaiApiKey) {
        throw new Error("OPENAI_API_KEY_REQUIRED_FOR_MANUAL_EXTRACTION_LLM");
    }
    const llmRaw = await (0, manualRequirement_llm_js_1.extractLlmManualRequirementCandidates)(rawText);
    const llm = filterLlmAgainstDeterministic(det, llmRaw);
    return [...det, ...llm];
}
/**
 * Removes all non-reviewed requirements for the manual, then inserts fresh candidates.
 * APPROVED and REJECTED rows (human-reviewed) are never touched.
 */
async function persistManualRequirementExtractions(prisma, manualId, payerId, planName, rawText, opts = {}) {
    const candidates = await extractManualRequirementCandidates(rawText, {
        useLlm: opts.useLlm ?? false,
        reviewOnly: opts.reviewOnly,
    });
    const traceableCandidates = candidates.filter((c) => hasTraceableExcerpt(rawText, c.sourceExcerpt));
    const data = (0, manualRequirement_mapper_js_1.toManualRequirementCreateManyInput)(manualId, payerId, planName, traceableCandidates);
    await prisma.$transaction(async (tx) => {
        await tx.manualRequirement.deleteMany({
            where: {
                manualId,
                reviewState: {
                    notIn: [governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED, governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.REJECTED],
                },
            },
        });
        if (data.length > 0) {
            await tx.manualRequirement.createMany({ data });
        }
    });
    return { created: data.length, candidates: candidates.length };
}
//# sourceMappingURL=manualRequirementExtraction.service.js.map