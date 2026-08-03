import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth", "/api/spear/metrics", "/images"];
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const session =
    req.cookies.get("next-auth.session-token") ??
    req.cookies.get("__Secure-next-auth.session-token") ??
    req.cookies.get("spear_session");

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
