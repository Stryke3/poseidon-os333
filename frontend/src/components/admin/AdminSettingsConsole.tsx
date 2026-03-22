"use client"

import { useMemo, useState } from "react"

import {
  HeroPanel,
  PageShell,
  SectionCard,
  SectionHeading,
} from "@/components/dashboard/DashboardPrimitives"

type PermissionOverride = {
  grant: string[]
  deny: string[]
}

type AdminUser = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  role: string
  territory_id?: string | null
  is_active: boolean
  last_login?: string | null
  created_at?: string | null
  permissions_override?: PermissionOverride
  effective_permissions?: string[]
}

type AdminPayload = {
  organization?: {
    name?: string
    slug?: string
    entity_type?: string
  }
  users: AdminUser[]
  permission_matrix: Record<string, string[]>
  all_permissions: string[]
}

type DraftState = Record<
  string,
  {
    first_name: string
    last_name: string
    role: string
    territory_id: string
    is_active: boolean
    password: string
    permissions_grant: string[]
    permissions_deny: string[]
  }
>

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "executive", label: "Executive" },
  { value: "billing", label: "Billing" },
  { value: "intake", label: "Intake" },
  { value: "rep", label: "Rep" },
  { value: "system", label: "System" },
]

function sortedUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort()
}

function buildDrafts(users: AdminUser[]): DraftState {
  return Object.fromEntries(
    users.map((user) => [
      user.id,
      {
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        role: user.role,
        territory_id: user.territory_id || "",
        is_active: Boolean(user.is_active),
        password: "",
        permissions_grant: sortedUnique(user.permissions_override?.grant || []),
        permissions_deny: sortedUnique(user.permissions_override?.deny || []),
      },
    ]),
  )
}

async function parseResponse(res: Response) {
  const data = await res.json().catch(() => ({ error: "Unexpected response" }))
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Request failed: ${res.status}`)
  }
  return data
}

function permissionLabel(permission: string) {
  return permission.replaceAll("_", " ")
}

function cyclePermissionState(
  grant: string[],
  deny: string[],
  permission: string,
): PermissionOverride {
  const granted = new Set(grant)
  const denied = new Set(deny)

  if (denied.has(permission)) {
    denied.delete(permission)
  } else if (granted.has(permission)) {
    granted.delete(permission)
    denied.add(permission)
  } else {
    granted.add(permission)
  }

  return {
    grant: sortedUnique(Array.from(granted)),
    deny: sortedUnique(Array.from(denied)),
  }
}

function PermissionButton({
  permission,
  mode,
  onClick,
}: {
  permission: string
  mode: "grant" | "deny" | "inherit"
  onClick: () => void
}) {
  const classes =
    mode === "grant"
      ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
      : mode === "deny"
        ? "border-accent-red/30 bg-accent-red/10 text-accent-red"
        : "border-white/10 bg-white/5 text-slate-300"

  return (
    <button
      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.12em] transition ${classes}`}
      onClick={onClick}
      type="button"
    >
      {permissionLabel(permission)}
    </button>
  )
}

export default function AdminSettingsConsole({ initialData }: { initialData: AdminPayload }) {
  const [users, setUsers] = useState(initialData.users || [])
  const [drafts, setDrafts] = useState<DraftState>(buildDrafts(initialData.users || []))
  const [banner, setBanner] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [newUser, setNewUser] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role: "rep",
    rep_id: "",
    permissions_grant: [] as string[],
    permissions_deny: [] as string[],
  })

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.role !== b.role) return a.role.localeCompare(b.role)
        return a.email.localeCompare(b.email)
      }),
    [users],
  )

  const allPermissions = initialData.all_permissions || []

  function updateDraft(userId: string, field: string, value: string | boolean | string[]) {
    setDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      },
    }))
  }

  function cycleDraftPermission(userId: string, permission: string) {
    const draft = drafts[userId]
    const next = cyclePermissionState(draft.permissions_grant, draft.permissions_deny, permission)
    updateDraft(userId, "permissions_grant", next.grant)
    updateDraft(userId, "permissions_deny", next.deny)
  }

  function toggleNewUserPermission(permission: string) {
    setNewUser((prev) => {
      const next = cyclePermissionState(prev.permissions_grant, prev.permissions_deny, permission)
      return {
        ...prev,
        permissions_grant: next.grant,
        permissions_deny: next.deny,
      }
    })
  }

  async function refreshUsers() {
    const res = await fetch("/api/admin/users", { cache: "no-store" })
    const data = (await parseResponse(res)) as AdminPayload
    setUsers(data.users || [])
    setDrafts(buildDrafts(data.users || []))
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy("create")
    setError("")
    setBanner("")
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })
      await parseResponse(res)
      await refreshUsers()
      setNewUser({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        role: "rep",
        rep_id: "",
        permissions_grant: [],
        permissions_deny: [],
      })
      setBanner("User created successfully.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user.")
    } finally {
      setBusy("")
    }
  }

  async function handleSaveUser(userId: string) {
    setBusy(`save:${userId}`)
    setError("")
    setBanner("")
    try {
      const draft = drafts[userId]
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: draft.first_name,
          last_name: draft.last_name,
          role: draft.role,
          territory_id: draft.territory_id,
          is_active: draft.is_active,
          permissions_grant: draft.permissions_grant,
          permissions_deny: draft.permissions_deny,
        }),
      })
      const updated = (await parseResponse(res)) as AdminUser
      setUsers((prev) => prev.map((user) => (user.id === userId ? updated : user)))
      setDrafts((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          permissions_grant: sortedUnique(updated.permissions_override?.grant || draft.permissions_grant),
          permissions_deny: sortedUnique(updated.permissions_override?.deny || draft.permissions_deny),
        },
      }))
      setBanner("User access updated.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update user.")
    } finally {
      setBusy("")
    }
  }

  async function handleResetPassword(userId: string) {
    const nextPassword = drafts[userId]?.password?.trim()
    if (!nextPassword) {
      setError("Enter a temporary password before resetting.")
      return
    }
    setBusy(`password:${userId}`)
    setError("")
    setBanner("")
    try {
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nextPassword }),
      })
      await parseResponse(res)
      setDrafts((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          password: "",
        },
      }))
      setBanner("Password reset successfully.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.")
    } finally {
      setBusy("")
    }
  }

  return (
    <PageShell>
      <HeroPanel
        eyebrow="Admin Settings"
        title="User Access Control"
        description="Create users, change roles, disable access, and tune user-level permission overrides from the live administration surface."
        actions={
          <div className="flex flex-wrap gap-3">
            <a
              className="rounded-2xl border border-accent-blue bg-accent-blue px-4 py-3 text-sm text-white"
              href="/executive"
            >
              Executive View
            </a>
            <a
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              href="/intake"
            >
              Intake View
            </a>
          </div>
        }
        aside={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <SectionCard className="border-accent-blue/20 bg-accent-blue/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-accent-blue">Organization</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {initialData.organization?.name || "StrykeFox"}
              </p>
              <p className="mt-1 text-xs text-slate-300">
                {initialData.organization?.slug || "poseidon"} · {initialData.organization?.entity_type || "multi"}
              </p>
            </SectionCard>
            <SectionCard className="border-white/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Access Summary</p>
              <p className="mt-2 text-xl font-semibold text-white">{users.length} users</p>
              <p className="mt-1 text-xs text-slate-300">
                {users.filter((user) => user.is_active).length} active · {users.filter((user) => !user.is_active).length} disabled
              </p>
            </SectionCard>
          </div>
        }
      />

      {(banner || error) && (
        <div className="mt-6">
          {banner && (
            <SectionCard className="border-accent-green/30 bg-accent-green/10 p-4 text-sm text-accent-green">
              {banner}
            </SectionCard>
          )}
          {error && (
            <SectionCard className="border-accent-red/30 bg-accent-red/10 p-4 text-sm text-accent-red">
              {error}
            </SectionCard>
          )}
        </div>
      )}

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_1.45fr]">
        <SectionCard>
          <SectionHeading
            eyebrow="Create User"
            title="Invite Staff"
            description="Role sets the baseline. Permission chips below add or deny access on top of that baseline."
          />
          <form className="grid gap-4" onSubmit={handleCreateUser}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={newUser.first_name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, first_name: e.target.value }))}
                className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                placeholder="First name"
              />
              <input
                value={newUser.last_name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, last_name: e.target.value }))}
                className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                placeholder="Last name"
              />
            </div>
            <input
              required
              value={newUser.email}
              onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
              className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
              placeholder="email@strykefox.com"
              type="email"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
                className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <input
                value={newUser.rep_id}
                onChange={(e) => setNewUser((prev) => ({ ...prev, rep_id: e.target.value }))}
                className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                placeholder="Territory / rep id"
              />
            </div>
            <input
              required
              value={newUser.password}
              onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
              className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
              placeholder="Temporary password"
              type="text"
            />
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">User Overrides</p>
              <p className="mt-2 text-xs text-slate-400">Click once to grant, twice to deny, third time to return to inherited role access.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {allPermissions.map((permission) => {
                  const mode = newUser.permissions_deny.includes(permission)
                    ? "deny"
                    : newUser.permissions_grant.includes(permission)
                      ? "grant"
                      : "inherit"
                  return (
                    <PermissionButton
                      key={permission}
                      permission={permission}
                      mode={mode}
                      onClick={() => toggleNewUserPermission(permission)}
                    />
                  )
                })}
              </div>
            </div>
            <button
              disabled={busy === "create"}
              className="rounded-xl bg-accent-blue px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-60"
              type="submit"
            >
              {busy === "create" ? "Creating..." : "Create User"}
            </button>
          </form>
        </SectionCard>

        <SectionCard>
          <SectionHeading
            eyebrow="Permissions"
            title="Role Matrix"
            description="Green chips are built into the role. User-level overrides below can grant or deny any permission individually."
          />
          <div className="grid gap-3">
            {Object.entries(initialData.permission_matrix || {}).map(([role, permissions]) => (
              <div key={role} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{role}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {permissions.map((permission) => (
                    <span
                      key={permission}
                      className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-accent-blue"
                    >
                      {permissionLabel(permission)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard>
          <SectionHeading
            eyebrow="User Directory"
            title="Manage Access"
            description="Update role, active status, and per-user permission overrides. Green means explicitly granted, red means explicitly denied."
          />
          <div className="grid gap-4">
            {sortedUsers.map((user) => {
              const draft = drafts[user.id]
              return (
                <div key={user.id} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="grid gap-4">
                    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr_auto]">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          value={draft?.first_name || ""}
                          onChange={(e) => updateDraft(user.id, "first_name", e.target.value)}
                          className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                          placeholder="First name"
                        />
                        <input
                          value={draft?.last_name || ""}
                          onChange={(e) => updateDraft(user.id, "last_name", e.target.value)}
                          className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                          placeholder="Last name"
                        />
                        <input
                          value={user.email}
                          disabled
                          className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400"
                        />
                        <input
                          value={draft?.territory_id || ""}
                          onChange={(e) => updateDraft(user.id, "territory_id", e.target.value)}
                          className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                          placeholder="Territory"
                        />
                      </div>

                      <div className="grid gap-3">
                        <select
                          value={draft?.role || user.role}
                          onChange={(e) => updateDraft(user.id, "role", e.target.value)}
                          className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-slate-200">
                          <input
                            checked={Boolean(draft?.is_active)}
                            onChange={(e) => updateDraft(user.id, "is_active", e.target.checked)}
                            type="checkbox"
                          />
                          Active user
                        </label>
                      </div>

                      <div className="grid gap-3">
                        <input
                          value={draft?.password || ""}
                          onChange={(e) => updateDraft(user.id, "password", e.target.value)}
                          className="rounded-xl border border-white/10 bg-navy-3 px-4 py-3 text-sm text-white"
                          placeholder="New temporary password"
                          type="text"
                        />
                        <div className="text-xs text-slate-400">
                          Last login: {user.last_login ? new Date(user.last_login).toLocaleString() : "Never"}
                        </div>
                        <div className="text-xs text-slate-400">
                          Effective: {(user.effective_permissions || []).map(permissionLabel).join(", ") || "No access"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <button
                          disabled={busy === `save:${user.id}`}
                          onClick={() => handleSaveUser(user.id)}
                          className="rounded-xl border border-accent-blue/40 bg-accent-blue/10 px-4 py-3 text-sm font-semibold text-accent-blue disabled:opacity-60"
                          type="button"
                        >
                          {busy === `save:${user.id}` ? "Saving..." : "Save"}
                        </button>
                        <button
                          disabled={busy === `password:${user.id}`}
                          onClick={() => handleResetPassword(user.id)}
                          className="rounded-xl border border-accent-gold/30 bg-accent-gold/10 px-4 py-3 text-sm font-semibold text-accent-gold-2 disabled:opacity-60"
                          type="button"
                        >
                          {busy === `password:${user.id}` ? "Resetting..." : "Reset Password"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Permission Overrides</p>
                      <p className="mt-2 text-xs text-slate-400">Click each permission to cycle inherited → granted → denied → inherited.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {allPermissions.map((permission) => {
                          const mode = draft?.permissions_deny.includes(permission)
                            ? "deny"
                            : draft?.permissions_grant.includes(permission)
                              ? "grant"
                              : "inherit"
                          return (
                            <PermissionButton
                              key={`${user.id}:${permission}`}
                              permission={permission}
                              mode={mode}
                              onClick={() => cycleDraftPermission(user.id, permission)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      </section>
    </PageShell>
  )
}
