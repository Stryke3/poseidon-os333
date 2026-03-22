import type { Metadata } from "next"

import PublicInquiryForm from "@/components/public/PublicInquiryForm"

export const metadata: Metadata = {
  title: "Founder | StrykeFox Medical",
  description: "Founder profile for Adam Stryker at StrykeFox Medical.",
}

const founderBio = [
  "Adam Stryker is the founder of StrykeFox Medical and the operator behind Poseidon, a platform shaped around the real pressure points inside modern healthcare revenue and growth.",
  "His work sits at the intersection of field execution, operational discipline, and product design, with a focus on building systems that help teams move faster without losing precision.",
  "This page is being kept intentionally focused on the mission, the perspective behind the company, and what is coming next.",
]

export default function FounderPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-navy text-white">
      <section className="relative isolate min-h-screen">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 18% 18%, rgba(240, 180, 50, 0.18), transparent 30%), radial-gradient(circle at 82% 16%, rgba(26, 110, 245, 0.2), transparent 28%), linear-gradient(135deg, rgba(5, 8, 15, 0.92) 20%, rgba(8, 13, 24, 0.72) 55%, rgba(5, 8, 15, 0.96) 100%)",
          }}
        />

        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-full md:block"
          style={{
            backgroundImage:
              "linear-gradient(270deg, rgba(5, 8, 15, 0.2) 0%, rgba(5, 8, 15, 0.68) 36%, rgba(5, 8, 15, 0.96) 62%), linear-gradient(180deg, rgba(5, 8, 15, 0.08) 0%, rgba(5, 8, 15, 0.5) 100%), url('/founder-portrait.jpg')",
            backgroundPosition: "right center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            filter: "saturate(0.96) contrast(1.02)",
            mixBlendMode: "screen",
            opacity: 0.84,
          }}
        />

        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-40"
          style={{
            background:
              "linear-gradient(180deg, rgba(5, 8, 15, 0) 0%, rgba(5, 8, 15, 0.78) 45%, rgba(5, 8, 15, 1) 100%)",
          }}
        />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-16 sm:px-10 lg:px-12">
          <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(320px,0.75fr)] lg:gap-16">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.42em] text-white/55">
                Founder
              </p>
              <h1 className="mt-4 max-w-xl font-display text-6xl uppercase leading-[0.9] text-white sm:text-7xl lg:text-[6.5rem]">
                Adam
                <br />
                Stryker
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-200/78 sm:text-lg">
                Building the operating system behind sharper healthcare execution.
              </p>

              <div className="mt-10 space-y-5">
                {founderBio.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="max-w-2xl text-sm leading-7 text-slate-200/76 sm:text-base"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex items-end lg:justify-end">
              <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.38em] text-accent-gold-2/80">
                  Engagements
                </p>
                <h2 className="mt-4 font-display text-4xl uppercase leading-none text-white">
                  Coming Soon
                </h2>
                <p className="mt-5 text-sm leading-7 text-slate-200/74 sm:text-base">
                  Select founder conversations, executive sessions, and private engagements
                  will be announced here soon.
                </p>
                <div className="mt-8 rounded-2xl border border-white/8 bg-black/20 px-5 py-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-white/45">
                    Status
                  </p>
                  <p className="mt-2 text-sm text-slate-200/72">
                    Books, speaking engagements, and public appearances are intentionally being
                    held back for now while this page is finalized.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/8 bg-[linear-gradient(180deg,#05080f_0%,#08111f_100%)]">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 lg:px-12 lg:py-20">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.42em] text-white/45">
              Connect
            </p>
            <h2 className="mt-4 font-display text-5xl uppercase leading-[0.92] text-white sm:text-6xl">
              Contact Or Partner With Us
            </h2>
            <p className="mt-5 text-sm leading-7 text-slate-200/72 sm:text-base">
              Every public inquiry submitted here is routed to patients@strykefox.com.
            </p>
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-3">
            <PublicInquiryForm
              inquiryType="contact"
              eyebrow="Contact Us"
              title="Start A Conversation"
              description="Reach out for general questions, founder inquiries, or direct follow-up."
            />
            <PublicInquiryForm
              inquiryType="partner"
              eyebrow="Partner With Us"
              title="Explore Partnership"
              description="Use this for strategic partnerships, business development, and collaboration opportunities."
            />
            <PublicInquiryForm
              inquiryType="rep-network"
              eyebrow="Apply To Rep Network"
              title="Join The Network"
              description="Use this to apply for rep opportunities, territory alignment, or sales network consideration."
            />
          </div>
        </div>
      </section>
    </main>
  )
}
