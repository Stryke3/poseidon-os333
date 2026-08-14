import { NextResponse } from "next/server";
import { publicStediStatus } from "@/lib/clearinghouse";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  return NextResponse.json(publicStediStatus());
}
