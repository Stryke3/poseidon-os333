// Tiered OCR Processor - Digital -> Scanned -> Handwritten fallback

import { extractText } from "unpdf";
import Tesseract from "tesseract.js";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";

export interface OCRResult {
  text: string;
  tier: number;
  confidence: number;
  coverage: number;
  warnings: string[];
}

export interface OCRConfig {
  maxPages?: number;
  minCoverage?: number;
  awsRegion?: string;
}

const DEFAULT_CONFIG: OCRConfig = {
  maxPages: 3,
  minCoverage: 0.2,
  awsRegion: "us-east-1",
};

/**
 * Tier 1: Digital PDF text extraction using unpdf
 * Fast, accurate for born-digital PDFs
 */
async function tier1DigitalExtraction(
  pdfBuffer: Buffer,
  config: OCRConfig
): Promise<OCRResult> {
  try {
    const { text } = await extractText(pdfBuffer);
    // unpdf returns text as an array of strings, join them
    const textString = Array.isArray(text) ? text.join("\n") : text;
    const coverage = textString.length > 0 ? 1.0 : 0.0;
    
    return {
      text: textString,
      tier: 1,
      confidence: 0.95,
      coverage,
      warnings: [],
    };
  } catch (error) {
    return {
      text: "",
      tier: 1,
      confidence: 0,
      coverage: 0,
      warnings: [`Tier 1 failed: ${(error as Error).message}`],
    };
  }
}

/**
 * Tier 2: Scanned PDF OCR using Tesseract.js
 * For image-based PDFs where digital extraction fails
 */
async function tier2ScannedExtraction(
  pdfBuffer: Buffer,
  config: OCRConfig
): Promise<OCRResult> {
  try {
    // Convert PDF to image for Tesseract (simplified - in production would use pdf-to-img)
    // For now, we'll attempt direct OCR on the buffer
    const result = await Tesseract.recognize(
      pdfBuffer,
      "eng",
      {
        logger: (m) => console.log(m), // Optional: log progress
      }
    );

    const text = result.data.text;
    const confidence = result.data.confidence / 100;
    
    // Calculate coverage based on expected clinical document keywords
    const keywords = ["NPI", "ICD-10", "CPT", "HCPCS", "diagnosis", "patient"];
    const foundKeywords = keywords.filter((kw) => 
      text.toLowerCase().includes(kw.toLowerCase())
    );
    const coverage = foundKeywords.length / keywords.length;

    const warnings: string[] = [];
    if (coverage < config.minCoverage!) {
      warnings.push("Tier 2: Low keyword coverage detected");
    }

    return {
      text,
      tier: 2,
      confidence,
      coverage,
      warnings,
    };
  } catch (error) {
    return {
      text: "",
      tier: 2,
      confidence: 0,
      coverage: 0,
      warnings: [`Tier 2 failed: ${(error as Error).message}`],
    };
  }
}

/**
 * Tier 3: Handwritten/AWS Textract fallback
 * For complex documents requiring AWS Textract
 */
async function tier3TextractExtraction(
  pdfBuffer: Buffer,
  config: OCRConfig
): Promise<OCRResult> {
  const warnings: string[] = [];
  
  // Check if AWS credentials are available
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    warnings.push("Tier 3: AWS credentials not configured - manual Textract trigger required");
    return {
      text: "",
      tier: 3,
      confidence: 0,
      coverage: 0,
      warnings,
    };
  }

  try {
    const textract = new TextractClient({ region: config.awsRegion });
    
    const command = new DetectDocumentTextCommand({
      Document: { Bytes: pdfBuffer },
    });

    const response = await textract.send(command);
    
    const text = response.Blocks
      ?.filter((block) => block.BlockType === "LINE")
      .map((block) => block.Text)
      .join("\n") || "";

    const confidence = 0.85; // Textract typically high confidence
    
    // Calculate coverage
    const keywords = ["NPI", "ICD-10", "CPT", "HCPCS", "diagnosis", "patient"];
    const foundKeywords = keywords.filter((kw) => 
      text.toLowerCase().includes(kw.toLowerCase())
    );
    const coverage = foundKeywords.length / keywords.length;

    if (coverage < config.minCoverage!) {
      warnings.push("Tier 3: Low keyword coverage even with Textract");
    }

    return {
      text,
      tier: 3,
      confidence,
      coverage,
      warnings,
    };
  } catch (error) {
    warnings.push(`Tier 3 failed: ${(error as Error).message}. Manual Textract trigger required.`);
    return {
      text: "",
      tier: 3,
      confidence: 0,
      coverage: 0,
      warnings,
    };
  }
}

/**
 * Main tiered OCR processor
 * Attempts extraction in order: Digital -> Scanned -> Textract
 */
export async function processDocumentWithTieredOCR(
  pdfBuffer: Buffer,
  config: OCRConfig = DEFAULT_CONFIG
): Promise<OCRResult> {
  // Tier 1: Digital extraction
  const tier1Result = await tier1DigitalExtraction(pdfBuffer, config);
  
  if (tier1Result.coverage >= config.minCoverage!) {
    console.log("OCR Tier 1 successful - digital extraction");
    return tier1Result;
  }

  console.log("OCR Tier 1 insufficient coverage, escalating to Tier 2");

  // Tier 2: Tesseract OCR
  const tier2Result = await tier2ScannedExtraction(pdfBuffer, config);
  
  // Check for critical clinical identifiers
  const hasNPI = tier2Result.text.toLowerCase().includes("npi");
  const hasICD10 = tier2Result.text.toLowerCase().includes("icd-10");
  
  if (tier2Result.coverage >= config.minCoverage! && (hasNPI || hasICD10)) {
    console.log("OCR Tier 2 successful - Tesseract extraction");
    return tier2Result;
  }

  console.log("OCR Tier 2 insufficient or missing critical identifiers, escalating to Tier 3");

  // Tier 3: AWS Textract
  const tier3Result = await tier3TextractExtraction(pdfBuffer, config);
  
  if (tier3Result.coverage >= config.minCoverage!) {
    console.log("OCR Tier 3 successful - Textract extraction");
    return tier3Result;
  }

  // All tiers failed - return best attempt with warnings
  console.warn("All OCR tiers failed or insufficient coverage");
  
  // Return the result with highest coverage
  const results = [tier1Result, tier2Result, tier3Result];
  const bestResult = results.reduce((best, current) => 
    current.coverage > best.coverage ? current : best
  );

  return {
    ...bestResult,
    warnings: [
      ...bestResult.warnings,
      "All OCR tiers failed to achieve minimum coverage. Manual review required.",
    ],
  };
}

/**
 * Extract denial code from EOB using tiered OCR
 */
export async function extractDenialCodeFromEOB(
  pdfBuffer: Buffer
): Promise<string | null> {
  const ocrResult = await processDocumentWithTieredOCR(pdfBuffer);
  
  // Common denial code patterns: CO-16, CO-50, PR-1, etc.
  const denialCodePattern = /\b(CO|PR|PI|OA|CAR)-\d{2,3}\b/g;
  const matches = ocrResult.text.match(denialCodePattern);
  
  if (matches && matches.length > 0) {
    return matches[0]; // Return first found denial code
  }
  
  return null;
}
