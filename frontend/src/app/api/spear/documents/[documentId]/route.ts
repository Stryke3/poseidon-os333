import { NextResponse } from "next/server";
import { getDocument } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const { documentId } = await params;
  const document = await getDocument(documentId);
  if (!document) return NextResponse.json({ ok: false, error: "Document not found", document_id: documentId }, { status: 404 });

  return new NextResponse(Buffer.from(document.content_base64, "base64"), {
    headers: {
      "Content-Type": document.content_type,
      "Content-Disposition": `attachment; filename="${document.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
