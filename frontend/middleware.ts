import { withAuth } from "next-auth/middleware"

export default withAuth({
  callbacks: {
    authorized: ({ token }) => Boolean(token?.accessToken),
  },
})

export const config = {
  matcher: [
    // Leave Next internals, public marketing routes, and public API routes alone.
    // Root "/" (CarePath landing) and /api/carepath-intake must be publicly accessible.
    "/((?!$|login|founder|api/auth|api/health|api/public-inquiry|api/carepath-intake|api/core|images|_next|favicon.ico).*)",
  ],
}
