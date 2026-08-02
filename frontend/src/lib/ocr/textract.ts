import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";

export interface OCRResult {
  text: string;
  confidence: number;
  missingFields: string[];
}

export async function parseTextract(file: File): Promise<OCRResult> {
  const warnings: string[] = [];
  
  // Check if AWS credentials are available
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn("AWS credentials not configured for Textract");
    return {
      text: "",
      confidence: 0,
      missingFields: ["HCPCS", "ICD", "NPI"],
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const textract = new TextractClient({ region: process.env.AWS_REGION || "us-east-1" });
    
    const command = new DetectDocumentTextCommand({
      Document: { Bytes: buffer },
    });

    const response = await textract.send(command);
    
    const text = response.Blocks
      ?.filter((block) => block.BlockType === "LINE")
      .map((block) => block.Text)
      .join("\n") || "";

    const confidence = 0.85; // Textract typically high confidence
    
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
    console.error("Textract error:", error);
    return {
      text: "",
      confidence: 0,
      missingFields: ["HCPCS", "ICD", "NPI"],
    };
  }
}
