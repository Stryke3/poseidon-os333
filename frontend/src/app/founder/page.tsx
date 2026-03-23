import type { Metadata } from "next"
import Script from "next/script"

import PublicInquiryForm from "@/components/public/PublicInquiryForm"

const SITE_URL = "https://strykefox.com"
const PAGE_URL = `${SITE_URL}/founder`

// TODO: Replace with real public URLs once assets are deployed
const IMAGE_URL = `${SITE_URL}/founder-portrait.jpg`
const LOGO_URL = `${SITE_URL}/images/strykefox-logo.png` // TODO: confirm public logo path
const LINKEDIN_URL = "https://www.linkedin.com/in/REPLACE_ME" // TODO: replace with real LinkedIn
const FACEBOOK_URL = "https://www.facebook.com/REPLACE_ME" // TODO: replace with real Facebook
const COMPANY_LINKEDIN_URL = "https://www.linkedin.com/company/REPLACE_ME" // TODO: replace
const COMPANY_FACEBOOK_URL = "https://www.facebook.com/REPLACE_ME" // TODO: replace

export const metadata: Metadata = {
  title: "Adam Stryker | Founder | Healthcare Operator | StrykeFox Medical",
  description:
    "Adam Stryker is a healthcare operator and founder of StrykeFox Medical, focused on medical devices, DME, biologics, physician enablement, reimbursement infrastructure, and healthcare platform development.",
  alternates: {
    canonical: PAGE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "Adam Stryker | Founder | StrykeFox Medical",
    description:
      "Healthcare operator focused on medical devices, DME, biologics, physician enablement, reimbursement infrastructure, and healthcare platform development.",
    url: PAGE_URL,
    siteName: "StrykeFox Medical",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Adam Stryker - Founder of StrykeFox Medical",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Adam Stryker | Founder | StrykeFox Medical",
    description:
      "Healthcare operator focused on medical devices, DME, biologics, physician enablement, reimbursement infrastructure, and healthcare platform development.",
    images: [IMAGE_URL],
  },
}

const profileJsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "@id": `${PAGE_URL}#profile`,
  url: PAGE_URL,
  name: "Adam Stryker | Founder | StrykeFox Medical",
  mainEntity: {
    "@type": "Person",
    "@id": `${PAGE_URL}#person`,
    name: "Adam Stryker",
    url: PAGE_URL,
    image: IMAGE_URL,
    description:
      "Healthcare operator and founder focused on medical devices, DME, biologics, physician enablement, reimbursement infrastructure, and healthcare platform development.",
    jobTitle: "Founder, StrykeFox Medical",
    worksFor: {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: "StrykeFox Medical",
      url: SITE_URL,
    },
    sameAs: [LINKEDIN_URL, FACEBOOK_URL], // TODO: replace placeholders
    knowsAbout: [
      "Medical devices",
      "Durable medical equipment",
      "DME",
      "Biologics",
      "Healthcare services",
      "Physician enablement",
      "Reimbursement infrastructure",
      "Orthopedic platform development",
      "Healthcare platform development",
    ],
  },
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}#organization`,
  name: "StrykeFox Medical",
  url: SITE_URL,
  logo: LOGO_URL,
  founder: {
    "@type": "Person",
    "@id": `${PAGE_URL}#person`,
    name: "Adam Stryker",
    url: PAGE_URL,
  },
  sameAs: [COMPANY_LINKEDIN_URL, COMPANY_FACEBOOK_URL], // TODO: replace placeholders
}

const philosophyPoints = [
  {
    number: "01",
    title: "Infrastructure Before Transactions",
    body: "Every revenue event in healthcare flows through infrastructure. Build it first. Transactions follow and compound on top of it.",
  },
  {
    number: "02",
    title: "Automation Eliminates Margin Drag",
    body: "Systems reduce friction, compress cycle times, improve reimbursement visibility, and preserve margin in regulated workflows.",
  },
  {
    number: "03",
    title: "Physician Enablement Wins Markets",
    body: "The real moat is not a single product. It is the operating architecture that helps physicians move faster, cleaner, and more compliantly.",
  },
]

export default function FounderPage() {
  return (
    <>
      <Script
        id="adam-stryker-profile-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
      />
      <Script
        id="strykefox-organization-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />

      <main className="min-h-screen overflow-hidden bg-navy text-white">
        {/* Hero */}
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
            <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] lg:gap-16">
              {/* Left column — identity and copy */}
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.42em] text-white/55">
                  Founder
                </p>
                <h1 className="mt-4 max-w-xl font-display text-6xl uppercase leading-[0.9] text-white sm:text-7xl lg:text-[6.5rem]">
                  Adam
                  <br />
                  Stryker
                </h1>

                <p className="mt-5 border-y border-white/10 py-4 font-mono text-[11px] uppercase tracking-[0.3em] text-accent-gold-2/80">
                  Founder, StrykeFox Medical · Healthcare Operator · Medical
                  Devices · DME · Biologics · Healthcare Platform Development
                </p>

                <div className="mt-8 space-y-5">
                  <p className="max-w-2xl text-sm leading-7 text-slate-200/78 sm:text-base">
                    Adam Stryker is a healthcare operator and founder of
                    StrykeFox Medical, focused on medical devices, DME,
                    biologics, physician enablement, reimbursement
                    infrastructure, and healthcare platform development.
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-slate-200/78 sm:text-base">
                    He builds integrated healthcare infrastructure across
                    surgical supply, technology-driven operations, physician
                    relationships, and scalable operating systems designed for
                    long-term value creation across regulated healthcare
                    markets.
                  </p>
                </div>

                <div className="mt-10 border-l-2 border-accent-gold-2/40 bg-white/5 px-6 py-5 text-base italic leading-8 text-slate-200/80">
                  &ldquo;Healthcare infrastructure is not a product category — it is
                  a systems architecture problem. The operators who win will be
                  the ones who build compounding platforms, not point
                  solutions.&rdquo;
                </div>
              </div>

              {/* Right column — supporting boxes */}
              <aside className="space-y-5 lg:pt-16">
                <div className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-xl sm:p-8">
                  <p className="font-mono text-[11px] uppercase tracking-[0.38em] text-accent-gold-2/80">
                    Platform Roles
                  </p>
                  <ul className="mt-4 space-y-2.5 text-sm leading-6 text-slate-200/76">
                    <li>Founder — StrykeFox Medical</li>
                    <li>Architect — Healthcare Platform Development</li>
                    <li>Operator — Medical Devices, DME, and Biologics</li>
                    <li>Developer — Poseidon OS</li>
                    <li>Founder — NorthStar Surgical Institute</li>
                    <li>Strategist — Physician Enablement and Growth</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-xl sm:p-8">
                  <p className="font-mono text-[11px] uppercase tracking-[0.38em] text-accent-gold-2/80">
                    Strategic Focus
                  </p>
                  <ul className="mt-4 space-y-2.5 text-sm leading-6 text-slate-200/76">
                    <li>Medical devices and surgical infrastructure</li>
                    <li>DME and reimbursement architecture</li>
                    <li>Biologics and physician enablement</li>
                    <li>Healthcare services growth systems</li>
                    <li>Capital structure and acquisition strategy</li>
                    <li>Margin architecture and scalable operations</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-xl sm:p-8">
                  <p className="font-mono text-[11px] uppercase tracking-[0.38em] text-accent-gold-2/80">
                    Industry Presence
                  </p>
                  <ul className="mt-4 space-y-2.5 text-sm leading-6 text-slate-200/76">
                    <li>
                      <a
                        href={LINKEDIN_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition hover:text-white"
                      >
                        LinkedIn — Thought Leadership
                      </a>
                    </li>
                    <li>
                      <a
                        href={FACEBOOK_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition hover:text-white"
                      >
                        Facebook — Public Profile
                      </a>
                    </li>
                    <li>Speaker — Healthcare Infrastructure</li>
                    <li>Founder — StrykeFox Medical Platform</li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Philosophy */}
        <section className="relative border-t border-white/8 bg-[linear-gradient(180deg,#05080f_0%,#08111f_100%)]">
          <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 lg:px-12 lg:py-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.42em] text-white/45">
              Philosophy
            </p>

            <h2 className="mt-4 max-w-5xl font-display text-5xl uppercase leading-[0.92] text-white sm:text-6xl lg:text-7xl">
              Building{" "}
              <span className="text-accent-gold-2">Compounding</span>
              <br />
              Healthcare
              <br />
              Infrastructure
            </h2>

            <div className="mt-14 space-y-8">
              {philosophyPoints.map((point) => (
                <div
                  key={point.number}
                  className="grid gap-4 border-t border-white/8 pt-8 md:grid-cols-[90px_1fr]"
                >
                  <div className="font-display text-5xl leading-none text-white/10">
                    {point.number}
                  </div>
                  <div>
                    <h3 className="text-xl font-light uppercase tracking-[0.05em] text-white sm:text-2xl">
                      {point.title}
                    </h3>
                    <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-200/60 sm:text-base">
                      {point.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
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
    </>
  )
}
