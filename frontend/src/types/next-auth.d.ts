import type { DefaultSession } from "next-auth"
import type { JWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      role?:
        | "admin"
        | "billing"
        | "rep"
        | "intake"
        | "executive"
        | "system"
      accessToken?: string
      orgId?: string
      permissions?: string[]
    }
  }

  interface User {
    role?:
      | "admin"
      | "billing"
      | "rep"
      | "intake"
      | "executive"
      | "system"
    accessToken?: string
    orgId?: string
    permissions?: string[]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?:
      | "admin"
      | "billing"
      | "rep"
      | "intake"
      | "executive"
      | "system"
    accessToken?: string
    orgId?: string
    permissions?: string[]
  }
}
