import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://www.adamwstryker.com";

export const metadata: Metadata = {
  title: "Candor Through Fire",
  description:
    "Candor Through Fire is Adam W. Stryker's platform on leverage, healthcare operations, compliance architecture, institutional pressure, survival, and disciplined rebuilding.",
  alternates: {
    canonical: `${SITE_URL}/candor-through-fire`,
  },
  openGraph: {
    title: "Candor Through Fire | Adam W. Stryker",
    description:
      "Candor Through Fire is Adam W. Stryker's platform on leverage, healthcare operations, compliance architecture, institutional pressure, survival, and disciplined rebuilding.",
    url: `${SITE_URL}/candor-through-fire`,
    siteName: "Adam W. Stryker",
    locale: "en_US",
    type: "article",
    images: [
      {
        url: `${SITE_URL}/og-image`,
        width: 1200,
        height: 630,
        alt: "Candor Through Fire by Adam W. Stryker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Candor Through Fire | Adam W. Stryker",
    description:
      "Candor Through Fire is Adam W. Stryker's platform on leverage, healthcare operations, compliance architecture, institutional pressure, survival, and disciplined rebuilding.",
    images: [`${SITE_URL}/og-image`],
  },
};

export default function CandorThroughFirePage() {
  return (
    <>
      <div className="noise-overlay" aria-hidden="true" />
      <div className="scanline" aria-hidden="true" />

      {/* Nav */}
      <nav
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "28px 48px",
          borderBottom: "1px solid rgba(245,244,241,0.06)",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-syne), 'Syne', sans-serif",
            fontWeight: 800,
            fontSize: "18px",
            letterSpacing: "-0.01em",
            color: "#f5f4f1",
            textDecoration: "none",
          }}
        >
          Adam W. Stryker
        </Link>
        <a
          href="https://www.strykefox.com"
          target="_blank"
          rel="noopener noreferrer"
          className="vault-link"
        >
          StrykeFox Medical →
        </a>
      </nav>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          position: "relative",
          zIndex: 5,
          padding: "80px 24px",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <div style={{ animation: "fadeUp 0.8s ease forwards" }}>
          <Link
            href="/candor-through-fire"
            style={{
              fontFamily:
                "var(--font-jetbrains), 'JetBrains Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#8b1e1e",
              textDecoration: "none",
              marginBottom: 32,
              display: "block",
            }}
          >
            Candor Through Fire
          </Link>

          <h1
            style={{
              fontFamily: "var(--font-syne), 'Syne', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(36px, 6vw, 64px)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "#f5f4f1",
              marginBottom: 32,
            }}
          >
            Candor Through Fire
          </h1>

          <p
            style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: "18px",
              lineHeight: 1.7,
              color: "rgba(245,244,241,0.5)",
              marginBottom: 64,
              maxWidth: 640,
            }}
          >
            Candor Through Fire is Adam W. Stryker&apos;s platform on leverage,
            healthcare operations, compliance architecture, institutional
            pressure, survival, and disciplined rebuilding.
          </p>

          <p
            style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: "16px",
              lineHeight: 1.8,
              color: "rgba(245,244,241,0.35)",
              marginBottom: 64,
              maxWidth: 640,
            }}
          >
            The work connects operating discipline, private equity strategy,
            healthcare infrastructure, and the systems required to build with
            clarity under pressure.
          </p>

          {/* Platform links */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 24,
              marginBottom: 80,
            }}
          >
            <PlatformCard
              title="Healthcare Infrastructure"
              description="Vertically integrated platforms spanning DME, surgical supply, biologics, and physician-facing reimbursement architecture."
              href="https://www.strykefox.com"
              external
            />
            <PlatformCard
              title="Platform Development"
              description="Developer of Poseidon OS — a CRM·EMR hybrid powering CarePath, the recovery pathway platform for post-surgical and maternity patients."
              href="https://www.strykefox.com/carepath"
              external
            />
            <PlatformCard
              title="Candor Through Fire"
              description="Author and architect of leverage. Writing at the intersection of compliance, institutional pressure, and operating discipline."
              href="/candor-through-fire"
            />
          </div>

          {/* Navigation links for internal linking */}
          <nav
            aria-label="Platform navigation"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
              marginBottom: 64,
            }}
          >
            <a
              href="https://www.strykefox.com"
              target="_blank"
              rel="noopener noreferrer"
              className="vault-link"
            >
              StrykeFox Medical
            </a>
            <a
              href="https://www.strykefox.com/carepath"
              target="_blank"
              rel="noopener noreferrer"
              className="vault-link"
            >
              CarePath Platform
            </a>
            <a
              href="https://www.strykefox.com/northstar-surgical-innovations"
              target="_blank"
              rel="noopener noreferrer"
              className="vault-link"
            >
              NorthStar Surgical (NSI)
            </a>
            <Link href="/candor-through-fire" className="vault-link">
              Candor Through Fire
            </Link>
            <a
              href="https://www.linkedin.com/in/adam-s-76a127265"
              target="_blank"
              rel="noopener noreferrer"
              className="vault-link"
            >
              LinkedIn
            </a>
          </nav>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          position: "relative",
          zIndex: 10,
          padding: "32px 48px",
          borderTop: "1px solid rgba(245,244,241,0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily:
              "var(--font-jetbrains), 'JetBrains Mono', monospace",
            fontSize: "10px",
            letterSpacing: "0.15em",
            color: "rgba(245,244,241,0.25)",
          }}
        >
          © 2026 Adam W. Stryker · Egeiro Holdings
        </div>
        <nav
          aria-label="Footer navigation"
          style={{ display: "flex", gap: 24 }}
        >
          <a
            href="https://www.strykefox.com"
            target="_blank"
            rel="noopener noreferrer"
            className="vault-link"
          >
            StrykeFox Medical
          </a>
          <a
            href="https://www.strykefox.com/carepath"
            target="_blank"
            rel="noopener noreferrer"
            className="vault-link"
          >
            CarePath
          </a>
          <a
            href="https://www.linkedin.com/in/adam-s-76a127265"
            target="_blank"
            rel="noopener noreferrer"
            className="vault-link"
          >
            LinkedIn
          </a>
        </nav>
      </footer>
    </>
  );
}

function PlatformCard({
  title,
  description,
  href,
  external,
}: {
  title: string;
  description: string;
  href: string;
  external?: boolean;
}) {
  const content = (
    <div
      style={{
        border: "1px solid rgba(245,244,241,0.08)",
        padding: 28,
        transition: "border-color 0.2s",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-syne), 'Syne', sans-serif",
          fontWeight: 700,
          fontSize: "16px",
          color: "#f5f4f1",
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          fontSize: "14px",
          lineHeight: 1.7,
          color: "rgba(245,244,241,0.4)",
        }}
      >
        {description}
      </p>
    </div>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none" }}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}
