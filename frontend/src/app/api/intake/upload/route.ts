import { NextRequest } from "next/server"

import { handleLiveIngestPost } from "@/lib/live-ingest-handler"

export const runtime = "nodejs"

/**
 * BFF for Intake Workspace file drop: multipart → Intake `/api/v1/intake/upload` → Core import.
 * Same handler as `POST /api/ingest/live` (kept for backward compatibility).
 */
export async function POST(req: NextRequest) {
  return handleLiveIngestPost(req)
}
