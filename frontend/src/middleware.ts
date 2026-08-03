import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC = ["/login", "/api/auth", "/images", "/api/fax/inbound"];
const DASHBOARD_ENTRY_REDIRECTS = [
  "/",
  "/carepath",
  "/northstar-surgical-innovations",
  "/soc13",
  "/mommy-care",
  "/el-kit-de-cuidado",
  "/founder",
  "/ceo",
  "/executive",
  "/matia",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const session = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (DASHBOARD_ENTRY_REDIRECTS.some((route) => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)))) {
    return NextResponse.redirect(new URL("/spear", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
