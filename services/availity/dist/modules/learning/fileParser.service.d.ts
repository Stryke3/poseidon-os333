export declare class FileParserService {
    parseFile(filePath: string): Promise<string>;
    private parseTxt;
    private parsePdf;
    private parseDocx;
    private normalize;
}
export declare const fileParserService: FileParserService;
export type SupportedManualFileExt = "pdf" | "docx" | "txt";
export declare function manualFileExt(filePath: string): SupportedManualFileExt | null;
export declare function normalizeWhitespace(input: string): string;
/**
 * Extracts and normalizes full manual text from a supported file.
 * (The `ext` arg is retained for compatibility with existing call sites.)
 */
export declare function parseManualFileToText(absPath: string, _ext?: SupportedManualFileExt | null): Promise<string>;
//# sourceMappingURL=fileParser.service.d.ts.map