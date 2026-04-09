import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { correlationHeaders, internalApiKeyHeaders } from "@/lib/proxy-headers";
import { getServiceBaseUrl } from "@/lib/runtime-config";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileName = (file as File).name || "document";
  const fileType = file.type || "application/octet-stream";
  const fileSize = file.size;

  // Validate file size (10MB max)
  if (fileSize > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File exceeds 10MB limit" },
      { status: 400 }
    );
  }

  // Try core intake/parse endpoint first (server-side OCR)
  try {
    const upstream = new FormData();
    upstream.append("file", file);

    const INTAKE_API_URL = getServiceBaseUrl("INTAKE_API_URL");
    const res = await fetch(`${INTAKE_API_URL}/api/v1/intake/parse-document`, {
      method: "POST",
      headers: {
        ...internalApiKeyHeaders(),
        ...correlationHeaders(req.headers),
      },
      body: upstream,
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        success: true,
        source: "server",
        fileName,
        fileType,
        ...data,
      });
    }
  } catch {
    // Intake service unavailable — fall through to client-side signal
  }

  // If server OCR unavailable, return metadata so client can run Tesseract.js
  return NextResponse.json({
    success: true,
    source: "client",
    fileName,
    fileType,
    fileSize,
    message: "Server OCR unavailable. Use client-side Tesseract.js processing.",
  });
}
