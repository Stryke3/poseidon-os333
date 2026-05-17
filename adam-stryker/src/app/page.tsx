import Link from "next/link";

export default function HomePage() {
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
        <div
          style={{
            fontFamily: "var(--font-syne), 'Syne', sans-serif",
            fontWeight: 800,
            fontSize: "18px",
            letterSpacing: "-0.01em",
            color: "#f5f4f1",
          }}
        >
          AWS
        </div>
        <div
          style={{
            fontFamily:
              "var(--font-jetbrains), 'JetBrains Mono', monospace",
            fontSize: "10px",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "rgba(245,244,241,0.3)",
          }}
        >
          ἐγείρω · EGEIRO HOLDINGS
        </div>
        <Link href="/candor-through-fire" className="vault-link">
          Enter Access Code
        </Link>
      </nav>

      {/* Main */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 24px",
          position: "relative",
          zIndex: 5,
          textAlign: "center",
        }}
      >
        <div style={{ animation: "fadeUp 0.8s ease forwards", maxWidth: 780 }}>
          {/* Restricted Access Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid rgba(139,30,30,0.4)",
              padding: "6px 16px",
              marginBottom: 48,
              fontFamily:
                "var(--font-jetbrains), 'JetBrains Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#8b1e1e",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#8b1e1e",
                animation: "blink 2s ease-in-out infinite",
                display: "inline-block",
              }}
              aria-hidden="true"
            />
            Restricted Access
          </div>

          {/* H1 */}
          <h1
            style={{
              fontFamily: "var(--font-syne), 'Syne', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(52px, 10vw, 110px)",
              lineHeight: 0.92,
              letterSpacing: "-0.03em",
              marginBottom: 32,
              color: "#f5f4f1",
            }}
          >
            ADAM W.
            <br />
            <span style={{ color: "#8b1e1e" }}>STRYKER</span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: "clamp(16px, 2.5vw, 22px)",
              color: "rgba(245,244,241,0.5)",
              marginBottom: 16,
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            Healthcare Operator. Investor. Systems Architect.
          </p>

          {/* Book link — crawlable */}
          <Link
            href="/candor-through-fire"
            style={{
              fontFamily:
                "var(--font-jetbrains), 'JetBrains Mono', monospace",
              fontSize: "11px",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#8b1e1e",
              textDecoration: "none",
              display: "block",
              marginBottom: 64,
            }}
          >
            Author · Candor Through Fire
          </Link>

          {/* Narrative section */}
          <div
            style={{
              maxWidth: 520,
              margin: "0 auto 64px",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: "16px",
              lineHeight: 1.8,
              color: "rgba(245,244,241,0.35)",
            }}
          >
            <p style={{ color: "rgba(245,244,241,0.6)", marginBottom: 20 }}>
              Fraud. Deceit. Corruption. Theft.
            </p>
            <p style={{ marginBottom: 20 }}>
              A decade of deliberate destruction by those closest to him.
            </p>
            <p
              style={{
                fontFamily:
                  "var(--font-jetbrains), 'JetBrains Mono', monospace",
                fontSize: "9px",
                letterSpacing: "0.5em",
                color: "rgba(245,244,241,0.1)",
                margin: "28px 0",
              }}
              aria-hidden="true"
            >
              ████████████████████████
            </p>
            <p style={{ color: "rgba(245,244,241,0.5)", marginBottom: 20 }}>
              They thought it was over.
            </p>
            <p
              style={{
                fontFamily:
                  "var(--font-jetbrains), 'JetBrains Mono', monospace",
                fontSize: "9px",
                letterSpacing: "0.5em",
                color: "rgba(245,244,241,0.1)",
                margin: "28px 0",
              }}
              aria-hidden="true"
            >
              ████████████████████████
            </p>
            <p
              style={{
                color: "#f5f4f1",
                fontStyle: "italic",
                marginBottom: 4,
              }}
            >
              It wasn&apos;t.
            </p>
          </div>

          {/* Standing statement */}
          <div
            style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: "18px",
              color: "rgba(245,244,241,0.6)",
              marginBottom: 64,
            }}
          >
            <p style={{ marginBottom: 4 }}>He stood back up.</p>
            <p style={{ fontStyle: "italic", color: "rgba(245,244,241,0.35)" }}>
              He always does.
            </p>
          </div>

          {/* Credentials */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              marginBottom: 64,
              alignItems: "center",
            }}
          >
            <Credential
              label="Inc. 5000"
              sublabel="Fast-Growth Recognition"
            />
            <Credential label="Top 300" sublabel="Healthcare Executives" />
            <Credential
              label="Top 10"
              sublabel="GHM Infrastructure Leaders 2026"
            />
            <div
              style={{
                fontFamily: "var(--font-syne), 'Syne', sans-serif",
                fontWeight: 700,
                fontSize: "18px",
                color: "#8b1e1e",
                marginTop: 16,
              }}
            >
              Still Standing
            </div>
          </div>

          {/* CTAs — crawlable links */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              marginBottom: 48,
            }}
          >
            <a href="mailto:contact@adamwstryker.com" className="vault-btn">
              Request Access
            </a>
            <Link
              href="/candor-through-fire"
              className="vault-link"
              style={{ fontSize: "11px" }}
            >
              I have an access code →
            </Link>
          </div>

          {/* Disclaimer */}
          <div
            style={{
              fontFamily:
                "var(--font-jetbrains), 'JetBrains Mono', monospace",
              fontSize: "9px",
              letterSpacing: "0.15em",
              color: "rgba(245,244,241,0.2)",
              maxWidth: 480,
              margin: "0 auto",
              lineHeight: 1.8,
            }}
          >
            <p>Access subject to NDA execution and vetting.</p>
            <p>
              Publishing rights, advisory, and strategic options available by
              arrangement.
            </p>
            <p>Unauthorized distribution will be prosecuted.</p>
          </div>
        </div>
      </main>

      {/* Footer — SEO: crawlable links + location */}
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
          © 2026 Adam W. Stryker · All Rights Reserved
        </div>
        <nav
          aria-label="Footer navigation"
          style={{
            display: "flex",
            gap: 24,
            alignItems: "center",
          }}
        >
          <Link href="/candor-through-fire" className="vault-link">
            Candor Through Fire
          </Link>
          <a
            href="https://www.strykefox.com"
            target="_blank"
            rel="noopener noreferrer"
            className="vault-link"
          >
            StrykeFox Medical
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
        <div
          style={{
            fontFamily:
              "var(--font-jetbrains), 'JetBrains Mono', monospace",
            fontSize: "10px",
            letterSpacing: "0.15em",
            color: "rgba(245,244,241,0.2)",
          }}
        >
          Las Vegas · Dallas · Panama
        </div>
      </footer>
    </>
  );
}

function Credential({
  label,
  sublabel,
}: {
  label: string;
  sublabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          letterSpacing: "0.2em",
          color: "#f5f4f1",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "10px",
          letterSpacing: "0.15em",
          color: "rgba(245,244,241,0.3)",
          textTransform: "uppercase",
        }}
      >
        {sublabel}
      </span>
    </div>
  );
}
