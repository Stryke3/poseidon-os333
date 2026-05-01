"use client"

import { signOut } from "next-auth/react"

interface TridentSecureControlsProps {
  email: string
  role: string
}

function formatRole(role: string) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

export function TridentSecureControls({ email, role }: TridentSecureControlsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[1.75rem] border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300">Authenticated session</p>
        <p className="mt-3 text-sm font-semibold text-white">{email}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-300">{formatRole(role)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-[#08152f]/70 px-3 py-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Access</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-white">Verified</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#08152f]/70 px-3 py-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Audit</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-white">Tracked</p>
          </div>
        </div>
      </div>

      <button
        className="rounded-full border border-white/15 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-300/50 hover:bg-white/14"
        onClick={() => signOut({ callbackUrl: "/login" })}
        type="button"
      >
        Sign out
      </button>
    </div>
  )
}
