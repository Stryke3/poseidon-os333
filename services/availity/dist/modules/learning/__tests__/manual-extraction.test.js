"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const manualExtraction_service_js_1 = require("../manualExtraction.service.js");
const governance_constants_js_1 = require("../../governance/governance.constants.js");
(0, vitest_1.describe)("previewManualExtraction", () => {
    (0, vitest_1.it)("extracts stable LMN, PA, restriction, and escalation requirements", async () => {
        const text = `
      Section 3. Submit a Letter of Medical Necessity (LMN) with prior authorization via the Availity portal.
      Appeals and peer-to-peer must follow the standard process within 14 business days.
    `;
        const out = await (0, manualExtraction_service_js_1.previewManualExtraction)(text);
        const types = new Set(out.map((r) => r.requirementType));
        (0, vitest_1.expect)(types.has(governance_constants_js_1.REQUIREMENT_TYPE.REQUIRED_DOCUMENT)).toBe(true);
        (0, vitest_1.expect)(types.has(governance_constants_js_1.REQUIREMENT_TYPE.AUTH_REQUIRED)).toBe(true);
        (0, vitest_1.expect)(types.has(governance_constants_js_1.REQUIREMENT_TYPE.ESCALATION)).toBe(true);
        (0, vitest_1.expect)(types.has(governance_constants_js_1.REQUIREMENT_TYPE.RESTRICTION)).toBe(true);
        (0, vitest_1.expect)(out.every((r) => (r.sourceExcerpt?.length ?? 0) > 0)).toBe(true);
    });
});
//# sourceMappingURL=manual-extraction.test.js.map