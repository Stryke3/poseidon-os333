"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const vitest_1 = require("vitest");
const manualScanIngestion_service_js_1 = require("../manualScanIngestion.service.js");
(0, vitest_1.describe)("manualScanIngestion inference", () => {
    (0, vitest_1.it)("toPosixRelative normalizes separators", () => {
        (0, vitest_1.expect)((0, manualScanIngestion_service_js_1.toPosixRelative)(`a${node_path_1.default.sep}b`)).toBe("a/b");
    });
    (0, vitest_1.it)("infers payer from first directory segment", () => {
        (0, vitest_1.expect)((0, manualScanIngestion_service_js_1.inferPayerKeyFromRelativePath)("aetna/dme/foo.txt")).toBe("AETNA");
        (0, vitest_1.expect)((0, manualScanIngestion_service_js_1.inferPayerKeyFromRelativePath)("UnitedHealthcare/policy.docx")).toBe("UNITEDHEALTHCARE");
    });
    (0, vitest_1.it)("infers payer from filename at root", () => {
        (0, vitest_1.expect)((0, manualScanIngestion_service_js_1.inferPayerKeyFromRelativePath)("bcbs-il-guide.pdf")).toBe("BCBS_IL_GUIDE");
    });
});
//# sourceMappingURL=manualScan.inference.test.js.map