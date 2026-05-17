import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <div className="noise-overlay" aria-hidden="true" />
      <div className="scanline" aria-hidden="true" />

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
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
            fontSize: "10px",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#8b1e1e",
            marginBottom: 32,
          }}
        >
          404 — Not Found
        </div>

        <h1
          style={{
            fontFamily: "var(--font-syne), 'Syne', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(36px, 8vw, 72px)",
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: "#f5f4f1",
            marginBottom: 24,
          }}
        >
          Access Denied
        </h1>

        <p
          style={{
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontSize: "16px",
            color: "rgba(245,244,241,0.4)",
            marginBottom: 48,
          }}
        >
          This page doesn&apos;t exist or has been restricted.
        </p>

        <nav
          style={{
            display: "flex",
            gap: 32,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link href="/" className="vault-btn">
            Return Home
          </Link>
          <Link href="/candor-through-fire" className="vault-link" style={{ fontSize: "11px", paddingTop: 16 }}>
            Candor Through Fire →
          </Link>
        </nav>
      </main>
    </>
  );
}
