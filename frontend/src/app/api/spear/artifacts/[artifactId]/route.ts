import { NextResponse } from "next/server";
import { getArtifact } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const { artifactId } = await params;
  const artifact = await getArtifact(artifactId);
  if (!artifact) return NextResponse.json({ ok: false, error: "Artifact not found", artifact_id: artifactId }, { status: 404 });

  return new NextResponse(Buffer.from(artifact.content_base64, "base64"), {
    headers: {
      "Content-Type": artifact.content_type,
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
