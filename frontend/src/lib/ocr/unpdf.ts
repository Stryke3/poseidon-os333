import { extractText } from "unpdf";

export interface OCRResult {
  text: string;
  confidence: number;
  missingFields: string[];
}

export async function parseUnpdf(file: File): Promise<OCRResult> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await extractText(buffer);
    
    // unpdf returns text as an array of strings, join them
    const textString = Array.isArray(text) ? text.join("\n") : text;
    
    // Check for required fields
    const missingFields: string[] = [];
    if (!textString.toLowerCase().includes("hcpcs")) missingFields.push("HCPCS");
    if (!textString.toLowerCase().includes("icd")) missingFields.push("ICD");
    if (!textString.toLowerCase().includes("npi")) missingFields.push("NPI");
    
    // Calculate confidence based on coverage
    const confidence = textString.length > 100 ? 0.9 : 0.5;
    
    return {
      text: textString,
      confidence,
      missingFields,
    };
  } catch (error) {
    return {
      text: "",
      confidence: 0,
      missingFields: ["HCPCS", "ICD", "NPI"],
    };
  }
}
