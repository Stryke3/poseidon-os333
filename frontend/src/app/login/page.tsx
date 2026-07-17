"use client"

import Image from "next/image"
import { signIn } from "next-auth/react"
import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("admin@strykefox.com")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl") || "/spear"
      const safeCallbackUrl = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/spear"

      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: safeCallbackUrl,
      })

      if (result?.error) {
        setError("Invalid credentials. Contact admin@strykefox.com")
        setLoading(false)
        return
      }

      window.location.href = result?.url || safeCallbackUrl
    } catch {
      setError("Cannot reach authentication service.")
      setLoading(false)
    }
  }

  return (
    <main className="login-page-root" style={styles.page}>
      <section style={styles.panel}>
        <div style={styles.brandRow}>
          <Image
            src="/images/sfm-logo.jpeg"
            alt="StrykeFox Medical"
            width={52}
            height={52}
            priority
            style={styles.logo}
          />
          <div>
            <p style={styles.brandName}>StrykeFox Medical</p>
            <p style={styles.brandSub}>Poseidon Dashboard</p>
          </div>
        </div>

        <div style={styles.copyBlock}>
          <p style={styles.eyebrow}>Secure operator access</p>
          <h1 style={styles.heading}>Sign in to dashboard</h1>
          <p style={styles.body}>Use your StrykeFox credentials to access live workflow, revenue, and patient operations.</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <label style={styles.label} htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
            style={styles.input}
          />

          <label style={styles.label} htmlFor="password">Password</label>
          <div style={styles.passwordWrap}>
            <input
              id="password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              placeholder="Enter password"
              style={{ ...styles.input, paddingRight: 74 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((value) => !value)}
              style={styles.showButton}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>

          {error ? <p style={styles.error}>{error}</p> : null}

          <button type="submit" disabled={loading} style={loading ? styles.submitDisabled : styles.submit}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div style={styles.footerRow}>
          <a href="https://strykefox.com" style={styles.footerLink}>StrykeFox Medical</a>
          <span style={styles.dot} />
          <a href="mailto:admin@strykefox.com" style={styles.footerLink}>Need access?</a>
        </div>
      </section>
    </main>
  )
}

const navy = "#0B1F3A"
const blue = "#2563EB"
const text = "#182337"
const muted = "#64748B"

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "32px 18px",
    background: "linear-gradient(180deg, #F8FBFF 0%, #EEF5FF 100%)",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: text,
  },
  panel: {
    width: "min(100%, 440px)",
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: "34px 32px 28px",
    boxShadow: "0 24px 80px rgba(11,31,58,0.12)",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 34,
  },
  logo: {
    borderRadius: 10,
    objectFit: "cover",
    border: "1px solid #E2E8F0",
  },
  brandName: {
    margin: 0,
    fontSize: 15,
    fontWeight: 750,
    letterSpacing: "0.01em",
    color: navy,
  },
  brandSub: {
    margin: "3px 0 0",
    fontSize: 12,
    color: muted,
  },
  copyBlock: {
    marginBottom: 28,
  },
  eyebrow: {
    margin: "0 0 10px",
    fontSize: 12,
    fontWeight: 700,
    color: blue,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  heading: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.12,
    fontWeight: 780,
    letterSpacing: "-0.02em",
    color: navy,
  },
  body: {
    margin: "12px 0 0",
    fontSize: 14,
    lineHeight: 1.65,
    color: muted,
  },
  form: {
    display: "grid",
    gap: 10,
  },
  label: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: 650,
    color: "#334155",
  },
  input: {
    width: "100%",
    height: 46,
    border: "1px solid #CBD5E1",
    borderRadius: 9,
    background: "#FFFFFF",
    color: text,
    padding: "0 13px",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  passwordWrap: {
    position: "relative",
  },
  showButton: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    border: 0,
    background: "transparent",
    color: blue,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "inherit",
  },
  error: {
    margin: "6px 0 0",
    padding: "10px 12px",
    borderRadius: 8,
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    fontSize: 13,
  },
  submit: {
    marginTop: 12,
    height: 48,
    border: 0,
    borderRadius: 9,
    background: navy,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 760,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 12px 24px rgba(11,31,58,0.18)",
  },
  submitDisabled: {
    marginTop: 12,
    height: 48,
    border: 0,
    borderRadius: 9,
    background: "#94A3B8",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 760,
    cursor: "not-allowed",
    fontFamily: "inherit",
  },
  footerRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 24,
  },
  footerLink: {
    color: muted,
    fontSize: 12,
    textDecoration: "none",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    background: "#CBD5E1",
  },
}
