// SWO Packet Builder - PDF Assembly for Physician Signature

import { PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface SWOPacketComponents {
  physicianSWOPage: Buffer | string; // Buffer or file path
  tridentClinicalRationale: Buffer | string; // Buffer or file path
  patientIntakeForm: Buffer | string; // Buffer or file path
}

export interface SWOPacketOptions {
  patientName: string;
  outputDir?: string;
  addWatermark?: boolean;
}

/**
 * Load PDF from buffer or file path
 */
async function loadPDF(source: Buffer | string): Promise<PDFDocument> {
  if (Buffer.isBuffer(source)) {
    return await PDFDocument.load(source);
  } else {
    const filePath = source;
    const fileBuffer = await fs.readFile(filePath);
    return await PDFDocument.load(fileBuffer);
  }
}

/**
 * Create a simple text page for missing components
 */
async function createPlaceholderPage(
  pdfDoc: PDFDocument,
  title: string,
  content: string
): Promise<PDFPage> {
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  
  page.drawText(title, {
    x: 50,
    y: height - 50,
    size: 18,
    font: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    color: rgb(0, 0, 0),
  });
  
  page.drawText(content, {
    x: 50,
    y: height - 100,
    size: 12,
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
    color: rgb(0.5, 0.5, 0.5),
  });
  
  return page;
}

/**
 * Add watermark to each page
 */
async function addWatermarkToPage(
  page: PDFPage,
  pdfDoc: PDFDocument,
  text: string
): Promise<void> {
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  page.drawText(text, {
    x: width / 2 - 50,
    y: height / 2,
    size: 48,
    font,
    color: rgb(0.9, 0.9, 0.9),
    opacity: 0.3,
  });
}

/**
 * Build SWO Packet by merging PDF components
 */
export async function buildSWOPacket(
  components: SWOPacketComponents,
  options: SWOPacketOptions
): Promise<Buffer> {
  const { physicianSWOPage, tridentClinicalRationale, patientIntakeForm } = components;
  const { patientName, outputDir, addWatermark = true } = options;

  // Create new PDF document
  const mergedPdf = await PDFDocument.create();

  // Load and merge Physician SWO Page
  try {
    const swoPdf = await loadPDF(physicianSWOPage);
    const swoPages = await mergedPdf.copyPages(swoPdf, swoPdf.getPageIndices());
    swoPages.forEach((page) => mergedPdf.addPage(page));
  } catch (error) {
    console.warn("Failed to load Physician SWO Page, using placeholder");
    await createPlaceholderPage(
      mergedPdf,
      "Physician SWO Page",
      "Original document could not be loaded. Please ensure the file is a valid PDF."
    );
  }

  // Load and merge Trident Clinical Rationale
  try {
    const rationalePdf = await loadPDF(tridentClinicalRationale);
    const rationalePages = await mergedPdf.copyPages(
      rationalePdf,
      rationalePdf.getPageIndices()
    );
    rationalePages.forEach((page) => mergedPdf.addPage(page));
  } catch (error) {
    console.warn("Failed to load Trident Clinical Rationale, using placeholder");
    await createPlaceholderPage(
      mergedPdf,
      "Trident Clinical Rationale",
      "Clinical rationale document could not be loaded. This should contain the Empirical-Bayes analysis and NOC narrative."
    );
  }

  // Load and merge Patient Intake Form
  try {
    const intakePdf = await loadPDF(patientIntakeForm);
    const intakePages = await mergedPdf.copyPages(
      intakePdf,
      intakePdf.getPageIndices()
    );
    intakePages.forEach((page) => mergedPdf.addPage(page));
  } catch (error) {
    console.warn("Failed to load Patient Intake Form, using placeholder");
    await createPlaceholderPage(
      mergedPdf,
      "Patient Intake Form",
      "Patient intake form could not be loaded. Please ensure the file is a valid PDF."
    );
  }

  // Add watermark if requested
  if (addWatermark) {
    const pages = mergedPdf.getPages();
    for (const page of pages) {
      await addWatermarkToPage(page, mergedPdf, "DRAFT - FOR PHYSICIAN REVIEW");
    }
  }

  // Generate output filename
  const sanitizedPatientName = patientName.replace(/[^a-zA-Z0-9]/g, "_");
  const outputFilename = `${sanitizedPatientName}_SWO_PACKET.pdf`;
  
  // Save PDF
  const pdfBytes = await mergedPdf.save();

  // Write to file if outputDir specified
  if (outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, outputFilename);
    await fs.writeFile(outputPath, pdfBytes);
    console.log(`SWO packet saved to: ${outputPath}`);
  }

  return Buffer.from(pdfBytes);
}

/**
 * Generate a simple Trident Clinical Rationale PDF from text
 */
export async function generateTridentRationalePDF(
  rationale: {
    score: number;
    confidence: string;
    rationale: string;
    recommendedAction: string;
    payerReliability: number;
  },
  patientName: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let yPosition = height - 50;
  
  // Title
  page.drawText("Trident Clinical Rationale", {
    x: 50,
    y: yPosition,
    size: 18,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= 40;
  
  // Patient Name
  page.drawText(`Patient: ${patientName}`, {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= 30;
  
  // Score
  page.drawText(`Trident Score: ${(rationale.score * 100).toFixed(1)}%`, {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= 30;
  
  // Confidence
  page.drawText(`Confidence Level: ${rationale.confidence}`, {
    x: 50,
    y: yPosition,
    size: 12,
    font: font,
    color: rgb(0, 0, 0),
  });
  yPosition -= 30;
  
  // Payer Reliability
  page.drawText(
    `Payer Reliability (Wilson Score): ${(rationale.payerReliability * 100).toFixed(1)}%`,
    {
      x: 50,
      y: yPosition,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    }
  );
  yPosition -= 40;
  
  // Rationale
  page.drawText("Clinical Rationale:", {
    x: 50,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= 25;
  
  // Word wrap for rationale text
  const maxLineWidth = width - 100;
  const words = rationale.rationale.split(" ");
  let currentLine = "";
  
  for (const word of words) {
    const testLine = currentLine + (currentLine ? " " : "") + word;
    const testWidth = font.widthOfTextAtSize(testLine, 10);
    
    if (testWidth > maxLineWidth) {
      page.drawText(currentLine, {
        x: 50,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      yPosition -= 15;
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    page.drawText(currentLine, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    yPosition -= 15;
  }
  
  yPosition -= 20;
  
  // Recommended Action
  page.drawText("Recommended Action:", {
    x: 50,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= 25;
  
  // Word wrap for recommended action
  const actionWords = rationale.recommendedAction.split(" ");
  let currentActionLine = "";
  
  for (const word of actionWords) {
    const testLine = currentActionLine + (currentActionLine ? " " : "") + word;
    const testWidth = font.widthOfTextAtSize(testLine, 10);
    
    if (testWidth > maxLineWidth) {
      page.drawText(currentActionLine, {
        x: 50,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      yPosition -= 15;
      currentActionLine = word;
    } else {
      currentActionLine = testLine;
    }
  }
  
  if (currentActionLine) {
    page.drawText(currentActionLine, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  }
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
