import Tesseract from "tesseract.js";

export interface OCRResult {
  text: string;
  confidence: number;
  missingFields: string[];
}

export async function parseTesseract(file: File): Promise<OCRResult> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    
    const result = await Tesseract.recognize(buffer, "eng", {
      logger: (m) => console.log(m),
    });

    const text = result.data.text;
    const confidence = result.data.confidence / 100;
    
    // Check for required fields
    const missingFields: string[] = [];
    if (!text.toLowerCase().includes("hcpcs")) missingFields.push("HCPCS");
    if (!text.toLowerCase().includes("icd")) missingFields.push("ICD");
    if (!text.toLowerCase().includes("npi")) missingFields.push("NPI");
    
    return {
      text,
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
