import { getServerSession, type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { getRequiredEnv, getServiceBaseUrl } from "@/lib/runtime-config"

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

const NEXTAUTH_SECRET = getRequiredEnv("NEXTAUTH_SECRET")
const APP_ENV = (process.env.NODE_ENV || "development").toLowerCase()

async function authenticateAgainstCore(email: string, password: string) {
  const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(`${coreApiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: controller.signal,
    })

    if (res.ok) {
      return (await res.json()) as {
        access_token?: string
        role?: AppRole
        org_id?: string
        user_id?: string
        permissions?: string[]
      }
    }

    if (res.status === 401) return null
    return null
  } catch {
    if (APP_ENV === "production") {
      throw new Error("Authentication dependency unavailable.")
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
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

        const email = credentials.email.trim().toLowerCase()
        const password = credentials.password

        const data = await authenticateAgainstCore(email, password)

        if (!data?.access_token || !data.role) return null

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
          name: email,
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

export async function getSafeServerSession() {
  try {
    return await getServerSession(authOptions)
  } catch {
    return null
  }
}
