import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const direction = searchParams.get("direction") || "";
  const limit = searchParams.get("limit") || "50";
  const offset = searchParams.get("offset") || "0";

  const qs = new URLSearchParams({ limit, offset });
  if (direction) qs.set("direction", direction);

  try {
    const res = await fetch(`${CORE_API_URL}/fax/log?${qs}`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) {
      // If core doesn't have fax log endpoint yet, return empty
      if (res.status === 404) {
        return NextResponse.json({ entries: [], total: 0 });
      }
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || "Failed to fetch fax log" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // Core unreachable — return empty log gracefully
    return NextResponse.json({ entries: [], total: 0 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  try {
    const res = await fetch(`${CORE_API_URL}/fax/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 404) {
        // Core doesn't have endpoint yet — store locally in response
        return NextResponse.json({ stored: "client", ...body });
      }
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || "Failed to store fax log" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ stored: "client", ...body });
  }
}
