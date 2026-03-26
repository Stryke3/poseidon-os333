export type SupportedManualExt = "txt" | "pdf" | "docx";
export declare function manualExtension(filePath: string): SupportedManualExt | null;
/**
 * Extracts plain text from a manual file. PDF/DOCX require optional npm dependencies.
 */
export declare function extractManualText(absPath: string, ext: SupportedManualExt): Promise<string>;
export declare function isSupportedManualFile(filePath: string): boolean;
//# sourceMappingURL=manualTextExtraction.d.ts.map