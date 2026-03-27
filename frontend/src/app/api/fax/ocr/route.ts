import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const CORE_API_URL = process.env.CORE_API_URL || "http://core:8001";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token?.accessToken) {
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

    const INTAKE_API_URL =
      process.env.INTAKE_API_URL || "http://poseidon_intake:8003";
    const res = await fetch(`${INTAKE_API_URL}/api/v1/intake/parse-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.accessToken}` },
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
