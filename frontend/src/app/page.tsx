import Link from "next/link"
import {
  Activity,
  ArrowRight,
  Baby,
  Bone,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  HeartPulse,
  Lock,
  Network,
  Orbit,
  ShieldCheck,
  Stethoscope,
  Truck,
  UserRoundCheck,
  Waves,
  Workflow,
} from "lucide-react"

const workflowNodes = [
  { label: "Clinical Trigger", detail: "Case signal captured", icon: Activity },
  { label: "Eligibility", detail: "Coverage verified", icon: ShieldCheck },
  { label: "Documentation", detail: "Record assembled", icon: FileCheck2 },
  { label: "Fulfillment", detail: "Pathway executed", icon: Truck },
  { label: "POD", detail: "Delivery proof locked", icon: ClipboardCheck },
  { label: "Billing Packet", detail: "Revenue-ready file", icon: CheckCircle2 },
]

const pathwayCards = [
  { title: "Surgical", icon: Stethoscope, copy: "Procedure-adjacent recovery coordination with documentation controls." },
  { title: "Orthopedic", icon: Bone, copy: "Brace, mobility, and recovery pathways organized around medical necessity." },
  { title: "Maternal", icon: Baby, copy: "Continuity infrastructure for perinatal and postpartum support pathways." },
  { title: "Mobility", icon: Orbit, copy: "Patient movement, device readiness, and fulfillment visibility in one record." },
  { title: "Wound", icon: HeartPulse, copy: "Document-heavy pathways governed by payer logic and supply continuity." },
  { title: "Post-Acute", icon: Waves, copy: "Recovery transitions coordinated beyond the visit and into the home." },
]

const providerBullets = [
  "Less staff drag",
  "Cleaner documentation",
  "Patient continuity",
  "Fulfillment visibility",
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 inline-flex items-center gap-2 border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.12)] backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_16px_rgba(96,165,250,0.95)]" />
      {children}
    </div>
  )
}

function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-white/10 bg-slate-950/45 shadow-2xl shadow-black/40 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  )
}

function WorkflowStrip() {
  return (
    <section id="workflow" className="relative border-y border-white/10 bg-[#06101d]/80 px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <SectionLabel>Pipeline Control</SectionLabel>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
              The pathway moves as one controlled system.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Every handoff is visible. Every document has a place. Every billing packet inherits the record that came before it.
          </p>
        </div>

        <GlassPanel className="overflow-hidden rounded-sm p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-6 lg:gap-0">
            {workflowNodes.map((node, index) => {
              const Icon = node.icon
              return (
                <div key={node.label} className="relative">
                  {index < workflowNodes.length - 1 ? (
                    <div className="absolute left-[calc(50%+34px)] top-8 hidden h-px w-[calc(100%-68px)] bg-gradient-to-r from-blue-500/80 via-blue-500/25 to-transparent lg:block" />
                  ) : null}
                  <div className="group relative flex h-full flex-col border border-white/10 bg-[#0B1829]/75 p-4 transition duration-300 hover:border-blue-500/40 hover:bg-blue-500/[0.07] hover:shadow-[0_0_35px_rgba(43,111,212,0.16)]">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center border border-blue-500/30 bg-blue-500/10">
                      <Icon className="h-6 w-6 text-blue-400" strokeWidth={1.5} />
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-400">
                      0{index + 1}
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-slate-100">{node.label}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{node.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </GlassPanel>
      </div>
    </section>
  )
}

function EngineSection() {
  return (
    <section id="engine" className="relative px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-3xl">
          <SectionLabel>Intelligence Engine</SectionLabel>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
            Poseidon preserves the record. Trident finds the gaps.
          </h2>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <GlassPanel className="relative overflow-hidden rounded-sm p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center border border-blue-500/30 bg-blue-500/10">
                  <Database className="h-6 w-6 text-blue-400" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-blue-400">Poseidon OS</p>
                  <h3 className="text-2xl font-semibold text-slate-100">Workflow Orchestration</h3>
                </div>
              </div>
              <Lock className="h-5 w-5 text-slate-500" strokeWidth={1.5} />
            </div>
            <p className="text-sm leading-7 text-slate-400">
              Intake, routing, fulfillment tracking, proof-of-delivery, billing readiness, and operational lineage live inside one controlled pathway record.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["Intake", "Routing", "Fulfillment"].map((item) => (
                <div key={item} className="border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 h-px w-10 bg-blue-500" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{item}</p>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="relative overflow-hidden rounded-sm p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center border border-blue-500/30 bg-blue-500/10">
                  <BrainCircuit className="h-6 w-6 text-blue-400" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-blue-400">Trident AI</p>
                  <h3 className="text-2xl font-semibold text-slate-100">Documentation Intelligence</h3>
                </div>
              </div>
              <Network className="h-5 w-5 text-slate-500" strokeWidth={1.5} />
            </div>
            <p className="text-sm leading-7 text-slate-400">
              Payer rules, compliance signals, missing-document detection, and reimbursement readiness are reviewed before the pathway reaches billing.
            </p>
            <div className="mt-8 space-y-3">
              {["Payer rule scan", "Clinical document gap check", "Revenue packet readiness"].map((item) => (
                <div key={item} className="flex items-center justify-between border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span className="text-sm text-slate-300">{item}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400">active</span>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </section>
  )
}

function PathwayCard({ title, copy, icon: Icon }: { title: string; copy: string; icon: typeof Activity }) {
  return (
    <div className="group relative overflow-hidden border border-white/10 bg-[#0B1829]/70 p-6 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-blue-500/40 hover:shadow-[0_0_45px_rgba(43,111,212,0.18)]">
      <div className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-blue-500 transition duration-300 group-hover:scale-x-100" />
      <div className="mb-8 flex h-12 w-12 items-center justify-center border border-blue-500/25 bg-blue-500/10">
        <Icon className="h-6 w-6 text-blue-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h3>
      <p className="mt-4 text-sm leading-6 text-slate-500">{copy}</p>
    </div>
  )
}

function PathwaysSection() {
  return (
    <section id="pathways" className="relative border-y border-white/10 bg-[#06101d]/85 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <SectionLabel>Owned Pathways</SectionLabel>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
              We do not think in product categories.
            </h2>
          </div>
          <p className="text-lg leading-8 text-slate-400">
            We think in pathways. The product mix changes. The pathway logic does not.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pathwayCards.map((card) => (
            <PathwayCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ProviderClose() {
  return (
    <section id="providers" className="relative px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <GlassPanel className="relative overflow-hidden rounded-sm p-8 sm:p-12 lg:p-16">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-blue-500/20" />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <SectionLabel>Provider Alignment</SectionLabel>
              <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-100 sm:text-6xl">
                Your staff focuses on patients. We own the pathway.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">
                CarePath absorbs the operational drag between clinical need and billing-ready documentation, preserving continuity without turning your team into a fulfillment desk.
              </p>
            </div>

            <div className="grid gap-3">
              {providerBullets.map((item) => (
                <div key={item} className="flex items-center gap-3 border border-white/10 bg-white/[0.03] px-4 py-4">
                  <CheckCircle2 className="h-5 w-5 text-blue-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>
      </div>
    </section>
  )
}

function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(43,111,212,0.18),transparent_32%),linear-gradient(180deg,#020713_0%,#07111F_45%,#030712_100%)]" />
      <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute left-0 right-0 top-32 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <nav className="flex items-center justify-between border border-white/10 bg-slate-950/35 px-4 py-3 backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-blue-500/30 bg-blue-500/10">
              <Workflow className="h-5 w-5 text-blue-400" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-100">StrykeFox</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-blue-400">CarePath</p>
            </div>
          </Link>
          <div className="hidden items-center gap-8 text-xs uppercase tracking-[0.18em] text-slate-400 md:flex">
            <a href="#workflow" className="transition hover:text-blue-400">Workflow</a>
            <a href="#engine" className="transition hover:text-blue-400">Poseidon</a>
            <a href="#pathways" className="transition hover:text-blue-400">Pathways</a>
          </div>
          <Link href="/login" className="border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-blue-500/40 hover:text-white">
            Login
          </Link>
        </nav>

        <div className="grid min-h-[calc(100vh-100px)] items-center gap-12 py-16 lg:grid-cols-[1fr_520px]">
          <div>
            <SectionLabel>Elite Care-Pathway Infrastructure</SectionLabel>
            <h1 className="text-[17vw] font-black uppercase leading-[0.78] tracking-[-0.09em] text-slate-100 sm:text-[132px] lg:text-[160px]">
              CAREPATH
            </h1>
            <p className="mt-8 text-3xl font-semibold tracking-tight text-blue-400 sm:text-5xl">
              Verify. Document. Deliver.
            </p>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
              The care-pathway infrastructure layer for modern healthcare recovery coordination. Not a product catalog. An operating system.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a href="#providers" className="group inline-flex items-center justify-center gap-2 bg-blue-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_40px_rgba(37,99,235,0.35)] transition hover:bg-blue-500">
                Partner With Us
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
              <Link href="/login" className="inline-flex items-center justify-center border border-blue-500/30 bg-white/[0.02] px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-200 backdrop-blur transition hover:border-blue-500/70 hover:bg-blue-500/10">
                Provider Login
              </Link>
            </div>
          </div>

          <GlassPanel className="relative overflow-hidden rounded-sm p-5">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(43,111,212,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(43,111,212,0.16)_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative">
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-blue-400">Command Layer</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">Pathway Control Plane</p>
                </div>
                <UserRoundCheck className="h-5 w-5 text-blue-400" strokeWidth={1.5} />
              </div>
              <div className="space-y-3">
                {workflowNodes.slice(0, 5).map((node, index) => {
                  const Icon = node.icon
                  return (
                    <div key={node.label} className="flex items-center gap-3 border border-white/10 bg-[#06101d]/80 p-3">
                      <div className="flex h-10 w-10 items-center justify-center border border-blue-500/25 bg-blue-500/10">
                        <Icon className="h-5 w-5 text-blue-400" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium text-slate-200">{node.label}</p>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">0{index + 1}</span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden bg-white/5">
                          <div className="h-full bg-blue-500" style={{ width: `${88 - index * 9}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </section>
  )
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#030712] font-sans text-slate-200">
      <Hero />
      <WorkflowStrip />
      <EngineSection />
      <PathwaysSection />
      <ProviderClose />
    </main>
  )
}
