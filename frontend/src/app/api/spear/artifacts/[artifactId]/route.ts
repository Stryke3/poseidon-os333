import { NextResponse } from "next/server";
import { getArtifact, getCase } from "@/lib/poseidon-store";
import { buildConveyorPacket } from "@/lib/services/packet/conveyor-packets";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

type PacketKind = Parameters<typeof buildConveyorPacket>[0]["kind"];

const ARTIFACT_PACKET_MAP: Record<string, { packetKind: PacketKind; title: string; watermark?: string }> = {
  coding_cover: { packetKind: "coding_cover", title: "Coding Cover Sheet" },
  provider_swo: { packetKind: "provider_swo", title: "Standard Written Order", watermark: "PENDING PROVIDER SIGNATURE" },
  payer_addendum: { packetKind: "payer_addendum", title: "Payer Provider Addendum" },
  billing_packet: { packetKind: "billing_packet", title: "Billing Packet" },
  pod: { packetKind: "pod", title: "Proof of Delivery", watermark: "PENDING RECIPIENT SIGNATURE" },
  final_bill_ready_packet: { packetKind: "final_bill_ready_packet", title: "Final Bill-Ready Packet" },
};

async function artifactBytes(artifact: Awaited<ReturnType<typeof getArtifact>>) {
  if (!artifact) return null;
  if (artifact.content_base64) return Buffer.from(artifact.content_base64, "base64");
  if (artifact.content_type !== "application/pdf") return null;

  const mapping = ARTIFACT_PACKET_MAP[artifact.kind];
  if (!mapping) return null;
  const caseRecord = await getCase(artifact.case_id);
  if (!caseRecord) return null;
  return buildConveyorPacket({
    caseRecord,
    kind: mapping.packetKind,
    title: mapping.title,
    watermark: mapping.watermark,
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const { artifactId } = await params;
  const artifact = await getArtifact(artifactId);
  if (!artifact) return NextResponse.json({ ok: false, error: "Artifact not found", artifact_id: artifactId }, { status: 404 });
  const content = await artifactBytes(artifact);
  if (!content || content.length === 0) return NextResponse.json({ ok: false, error: "Artifact content unavailable", artifact_id: artifactId }, { status: 404 });

  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": artifact.content_type,
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "Content-Length": String(content.length),
      "Cache-Control": "private, no-store",
    },
  });
}
