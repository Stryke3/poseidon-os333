import { NextRequest, NextResponse } from "next/server";
import { getServiceBaseUrl } from "@/lib/runtime-config";
import { getSafeServerSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSafeServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json(
      { error: "Your session expired. Please sign in again." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const direction = searchParams.get("direction") || "";
  const limit = searchParams.get("limit") || "50";
  const offset = searchParams.get("offset") || "0";

  const qs = new URLSearchParams({ limit, offset });
  if (direction) qs.set("direction", direction);

  try {
    const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL");
    const res = await fetch(`${coreApiUrl}/fax/log?${qs}`, {
      headers: { Authorization: `Bearer ${session.user.accessToken}` },
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
  const session = await getSafeServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json(
      { error: "Your session expired. Please sign in again." },
      { status: 401 },
    );
  }

  const body = await req.json();

  try {
    const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL");
    const res = await fetch(`${coreApiUrl}/fax/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.user.accessToken}`,
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
