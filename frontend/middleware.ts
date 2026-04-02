import { withAuth } from "next-auth/middleware"

export default withAuth({
  callbacks: {
    authorized: ({ token }) => Boolean(token?.accessToken),
  },
})

export const config = {
  matcher: [
    // Leave Next internals and public auth/health routes alone so the login page can
    // load its own chunks without being bounced through auth middleware.
    "/((?!login|founder|api/auth|api/health|api/public-inquiry|api/core|_next|favicon.ico).*)",
  ],
}
