import { NextResponse } from "next/server";
import { extractIntakeDocument } from "@/lib/intake-extraction";
import { savePendingIntakeDocument } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/tiff"]);

function jsonError(message: string, status: number, nextAction: string, code: string) {
  return NextResponse.json({ ok: false, error: message, code, next_action: nextAction }, { status });
}

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError("Unsupported request. Upload the source document as multipart/form-data.", 415, "Choose a PDF or image and retry upload.", "unsupported_request");
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) {
    return jsonError("Upload failed. No source document was received.", 400, "Choose the document again and retry upload.", "upload_missing");
  }

  const mime = file.type || "application/pdf";
  if (!ALLOWED_TYPES.has(mime)) {
    return jsonError("Unsupported file type.", 415, "Upload a PDF, PNG, JPG, JPEG, or TIFF file.", "unsupported_file_type");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError("Document too large.", 413, "Split the packet or upload a file under 25 MB.", "document_too_large");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let document;
  try {
    document = await savePendingIntakeDocument({
      filename: file.name || "intake-source.pdf",
      content_type: mime,
      content: buffer,
      metadata: {
        original_size: file.size,
        uploaded_via: "spear_intake",
      },
    });
  } catch (error) {
    return jsonError(
      `Document storage failed: ${error instanceof Error ? error.message : "unknown error"}`,
      500,
      "Retry upload. If storage fails again, stop intake and check the SPEAR store.",
      "document_storage_failed",
    );
  }

  try {
    const extraction = await extractIntakeDocument(buffer, mime);
    return NextResponse.json({
      ok: true,
      document: {
        document_id: document.id,
        filename: document.filename,
        page_count: extraction.page_count,
        mime_type: document.content_type,
        size: document.size,
        storage_status: "stored",
        extraction_status: extraction.extraction_status,
      },
      extraction,
      workflow_events: ["intake_document_uploaded", "source_document_stored"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Text extraction failed.";
    const code = /encrypted|password/i.test(message) ? "encrypted_pdf" : "text_extraction_failed";
    const nextAction = code === "encrypted_pdf"
      ? "Request an unlocked copy of the PDF, or choose explicit manual entry with a note."
      : "Retry extraction. If it fails again, use manual entry exception with a reason.";
    return NextResponse.json({
      ok: true,
      document: {
        document_id: document.id,
        filename: document.filename,
        page_count: 0,
        mime_type: document.content_type,
        size: document.size,
        storage_status: "stored",
        extraction_status: "manual_exception_available",
      },
      extraction: {
        page_count: 0,
        extraction_status: "manual_exception_available",
        progress: ["Inspecting document", "Text extraction failed", "Manual exception available"],
        pages: [],
        fields: [],
        combined_text: "",
        warnings: [message],
      },
      workflow_events: ["intake_document_uploaded", "source_document_stored"],
      warning: message,
      code,
      next_action: nextAction,
    });
  }
}

