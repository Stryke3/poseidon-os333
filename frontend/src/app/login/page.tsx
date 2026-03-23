"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

import { PageShell } from "@/components/dashboard/DashboardPrimitives"

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ")
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError("Invalid credentials. Contact your administrator.")
      setLoading(false)
      return
    }

    router.push("/")
  }

  return (
    <PageShell contentClassName="justify-center">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(187,247,208,0.1),transparent_20%),radial-gradient(circle_at_78%_16%,rgba(216,180,106,0.14),transparent_22%),radial-gradient(circle_at_50%_110%,rgba(186,230,253,0.18),transparent_30%),linear-gradient(180deg,#091523_0%,#0b1728_42%,#0f2136_100%)]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(159,196,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(159,196,255,0.04)_1px,transparent_1px)] [background-size:140px_140px]" />
        <div className="absolute left-[-12%] top-[8%] h-[26rem] w-[26rem] rounded-full bg-cyan-200/15 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-6%] h-[24rem] w-[24rem] rounded-full bg-[#d8b46a]/12 blur-3xl" />
      </div>

      <div className="mx-auto grid w-full max-w-[1280px] gap-10 lg:grid-cols-[minmax(0,1.15fr)_460px] lg:items-center">
        <section className="px-2">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-200 shadow-[0_0_14px_rgba(187,247,208,0.8)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-300">
              Stryke Fox Medical Secure Access
            </span>
          </div>

          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.42em] text-[#f4e7c5]">
            Poseidon Enterprise OS
          </p>
          <h1 className="mt-4 max-w-4xl font-display text-[3.3rem] uppercase leading-[0.9] tracking-[0.07em] text-white sm:text-[5.75rem]">
            Enter the
            <br />
            operating system.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300">
            Access live patients, queue status, reimbursement activity, and operator workflow from one surface.
          </p>

        </section>

        <section className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,26,0.94),rgba(6,10,18,0.92))] p-8 shadow-[0_36px_110px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:p-9">
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#d8b46a]">
                  Poseidon Gateway
                </p>
                <h2 className="mt-3 font-display text-4xl uppercase tracking-[0.14em] text-white">
                  Secure Access
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                HIPAA Aware
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["Auth", "Live"],
                ["Session", "Encrypted"],
                ["Org", "Stryke Fox"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-white/10 bg-white/[0.03] px-3 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                Email
              </label>
              <input
                className="w-full rounded-[22px] border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[#d8b46a]/40 focus:bg-white/[0.03]"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@strykefoxmedical.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <label className="block font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                  Password
                </label>
                <button
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-300"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                className="w-full rounded-[22px] border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[#d8b46a]/40 focus:bg-white/[0.03]"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
            </div>

            {error ? (
              <div className="rounded-[22px] border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {error}
              </div>
            ) : null}

            <button
              className={cn(
                "w-full rounded-full border border-[#d8b46a]/30 bg-[linear-gradient(180deg,rgba(216,180,106,0.18),rgba(216,180,106,0.08))] px-4 py-3.5 text-sm font-semibold uppercase tracking-[0.2em] text-[#f8e7bb] transition",
                "hover:bg-[linear-gradient(180deg,rgba(216,180,106,0.24),rgba(216,180,106,0.12))] hover:shadow-[0_0_30px_rgba(216,180,106,0.12)]",
                loading && "cursor-not-allowed opacity-60",
              )}
              disabled={loading}
              type="submit"
            >
              {loading ? "Authenticating..." : "Enter Poseidon"}
            </button>
          </form>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Access Notice</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Authorized Stryke Fox personnel only. Access attempts may be logged for compliance and security review.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.18em] text-slate-600">
            <span>Encrypted Session</span>
            <span>Clinical. Revenue. Control.</span>
            <span>Stryke Fox Medical</span>
          </div>
        </section>
      </div>
    </PageShell>
  )
}
