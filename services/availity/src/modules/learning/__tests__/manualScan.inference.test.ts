import path from "node:path";
import { describe, expect, it } from "vitest";
import { inferPayerKeyFromRelativePath, toPosixRelative } from "../manualScanIngestion.service.js";

describe("manualScanIngestion inference", () => {
  it("toPosixRelative normalizes separators", () => {
    expect(toPosixRelative(`a${path.sep}b`)).toBe("a/b");
  });

  it("infers payer from first directory segment", () => {
    expect(inferPayerKeyFromRelativePath("aetna/dme/foo.txt")).toBe("AETNA");
    expect(inferPayerKeyFromRelativePath("UnitedHealthcare/policy.docx")).toBe("UNITEDHEALTHCARE");
  });

  it("infers payer from filename at root", () => {
    expect(inferPayerKeyFromRelativePath("bcbs-il-guide.pdf")).toBe("BCBS_IL_GUIDE");
  });
});
