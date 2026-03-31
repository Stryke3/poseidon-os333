export { default } from "next-auth/middleware"

export const config = {
  matcher: [
    "/((?!login|founder|api/auth|api/health|api/public-inquiry|_next/static|_next/image|favicon.ico).*)",
  ],
}
