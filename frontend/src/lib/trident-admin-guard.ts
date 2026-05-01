import { NextResponse } from "next/server"

import { getSafeServerSession } from "@/lib/auth"

/** Core-backed session must be admin to manage Lite reference lists. */
export async function getTridentAdminSessionOrResponse(): Promise<
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getSafeServerSession>>> }
  | { ok: false; response: NextResponse }
> {
  const session = await getSafeServerSession()
  if (!session?.user?.accessToken) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (session.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 }),
    }
  }
  return { ok: true, session }
}
