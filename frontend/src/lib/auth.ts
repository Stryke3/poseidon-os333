import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

type AppRole =
  | "admin"
  | "billing"
  | "rep"
  | "intake"
  | "executive"
  | "system"

interface LiveUser {
  id: string
  email: string
  role: AppRole
  accessToken: string
  orgId?: string
  permissions?: string[]
}

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET
const APP_ENV = (process.env.NODE_ENV || "development").toLowerCase()

if (!NEXTAUTH_SECRET && APP_ENV === "production") {
  throw new Error("NEXTAUTH_SECRET is required in production.")
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Poseidon OS",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const res = await fetch(`${CORE_API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
          cache: "no-store",
        }).catch(() => null)

        if (!res?.ok) return null

        const data = (await res.json()) as {
          access_token?: string
          role?: AppRole
          org_id?: string
          user_id?: string
          permissions?: string[]
        }

        if (!data.access_token || !data.role) return null

        const user: LiveUser = {
          id: data.user_id || credentials.email,
          email: credentials.email,
          role: data.role,
          accessToken: data.access_token,
          orgId: data.org_id,
          permissions: data.permissions || [],
        }

        return {
          ...user,
          name: credentials.email,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.role) {
        token.role = user.role
        token.accessToken = user.accessToken
        token.orgId = user.orgId
        token.email = user.email
        token.permissions = user.permissions || []
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.role) {
        session.user.id = token.sub || ""
        session.user.role = token.role
        session.user.accessToken = token.accessToken
        session.user.orgId = token.orgId
        session.user.email = token.email || session.user.email
        session.user.permissions = (token.permissions as string[]) || []
      }
      return session
    },
  },
  secret: NEXTAUTH_SECRET,
}
