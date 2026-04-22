import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

const redirectToCases = [
  "/",
  "/ceo",
  "/edi",
  "/exec",
  "/executive",
  "/fax",
  "/founder",
  "/intake",
  "/matia",
  "/patients",
  "/revenue",
]

const redirectToSettings = ["/admin", "/settings"]

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl

    if (redirectToCases.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return NextResponse.redirect(new URL("/trident/cases", req.url))
    }

    if (redirectToSettings.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return NextResponse.redirect(new URL("/trident/settings", req.url))
    }

    if (pathname === "/lite" || pathname.startsWith("/lite/")) {
      return NextResponse.redirect(new URL(pathname.replace(/^\/lite/, "/trident"), req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token?.accessToken),
    },
  },
)

export const config = {
  matcher: [
    // Leave Next internals and public auth/health routes alone so the login page can
    // load its own chunks without being bounced through auth middleware.
    "/((?!login|founder|api/auth|api/health|api/public-inquiry|api/core|_next|favicon.ico).*)",
  ],
}
