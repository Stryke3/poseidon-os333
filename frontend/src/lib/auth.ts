import { getServerSession, type NextAuthOptions } from "next-auth"
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

const CORE_API_URLS = Array.from(
  new Set(
    [
      process.env.POSEIDON_API_URL,
      process.env.CORE_API_URL,
      "http://core:8001",
      "http://core-8cql:10000",
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  )
)
const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || process.env.SECRET_KEY
const APP_ENV = (process.env.NODE_ENV || "development").toLowerCase()

if (!NEXTAUTH_SECRET && APP_ENV === "production") {
  console.warn("NEXTAUTH_SECRET is unset in production; auth routes may be unavailable.")
}

async function authenticateAgainstCore(email: string, password: string) {
  for (const baseUrl of CORE_API_URLS) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/auth/login`, {
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
    } catch {
      // Try the next known internal Core address.
    } finally {
      clearTimeout(timeout)
    }
  }

  return null
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
  if (!NEXTAUTH_SECRET) return null

  try {
    return await getServerSession(authOptions)
  } catch (error) {
    console.warn("Unable to resolve server session.", error)
    return null
  }
}
