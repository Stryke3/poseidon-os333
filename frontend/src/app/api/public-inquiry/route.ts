import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { getRequiredEnv } from "@/lib/runtime-config"

const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 5
const inquiryRequestLog = new Map<string, number[]>()

type InquiryPayload = {
  inquiryType?: string
  name?: string
  email?: string
  company?: string
  phone?: string
  message?: string
  website?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+().\-\s]{7,40}$/
const ALLOWED_INQUIRY_TYPES = new Set(["contact", "partner", "rep-network"])

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function formatInquiryType(value: string) {
  const normalized = value.toLowerCase()
  if (normalized === "partner") return "Partner With Us"
  if (normalized === "contact") return "Contact Us"
  if (normalized === "rep-network") return "Apply To Rep Network"
  return "General Inquiry"
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown"
  return req.headers.get("x-real-ip") || "unknown"
}

function pruneWindow(timestamps: number[]) {
  const cutoff = Date.now() - WINDOW_MS
  return timestamps.filter((timestamp) => timestamp >= cutoff)
}

function hasSuspiciousContent(value: string) {
  const normalized = value.toLowerCase()
  const links = normalized.match(/https?:\/\//g) ?? []
  return links.length > 2 || normalized.includes("<a ") || normalized.includes("[url=")
}

function isAllowedOrigin(req: NextRequest) {
  const origin = req.headers.get("origin")
  if (!origin) return true

  const configured = process.env.PUBLIC_INQUIRY_ALLOWED_ORIGINS || process.env.NEXTAUTH_URL || ""
  const allowedOrigins = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  return allowedOrigins.includes(origin)
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedOrigin(req)) {
      return NextResponse.json({ error: "Origin not allowed." }, { status: 403 })
    }

    const body = (await req.json()) as InquiryPayload

    const inquiryType = clean(body.inquiryType) || "contact"
    const name = clean(body.name)
    const email = clean(body.email)
    const company = clean(body.company)
    const phone = clean(body.phone)
    const message = clean(body.message)
    const website = clean(body.website)

    if (website) {
      return NextResponse.json({ status: "ok" })
    }

    if (!ALLOWED_INQUIRY_TYPES.has(inquiryType)) {
      return NextResponse.json({ error: "Invalid inquiry type." }, { status: 400 })
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required." },
        { status: 400 },
      )
    }

    if (name.length > 120 || email.length > 200 || company.length > 200 || phone.length > 40 || message.length > 5000) {
      return NextResponse.json(
        { error: "Inquiry fields exceed allowed length." },
        { status: 400 },
      )
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 },
      )
    }

    if (phone && !PHONE_PATTERN.test(phone)) {
      return NextResponse.json(
        { error: "Please provide a valid phone number." },
        { status: 400 },
      )
    }

    if (hasSuspiciousContent(message) || hasSuspiciousContent(company)) {
      return NextResponse.json(
        { error: "Inquiry content was rejected." },
        { status: 400 },
      )
    }

    const ip = clientIp(req)
    const recentRequests = pruneWindow(inquiryRequestLog.get(ip) || [])
    if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
      inquiryRequestLog.set(ip, recentRequests)
      return NextResponse.json(
        { error: "Too many inquiries. Please try again later." },
        { status: 429 },
      )
    }
    recentRequests.push(Date.now())
    inquiryRequestLog.set(ip, recentRequests)

    if (inquiryRequestLog.size > 5000) {
      for (const [loggedIp, timestamps] of Array.from(inquiryRequestLog.entries())) {
        const active = pruneWindow(timestamps)
        if (active.length === 0) inquiryRequestLog.delete(loggedIp)
        else inquiryRequestLog.set(loggedIp, active)
      }
    }

    const recipient = getRequiredEnv("PUBLIC_INQUIRY_TO")
    const gmailUser = process.env.GMAIL_INTAKE_USER || process.env.EMAIL_INTAKE_USERNAME || ""
    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || ""
    const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || ""
    const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN || ""

    if (!gmailUser || !clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: "Public inquiry email is not configured." },
        { status: 500 },
      )
    }

    const prettyType = formatInquiryType(inquiryType)
    const subject = `[Website] ${prettyType} from ${name}`

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: gmailUser,
        clientId,
        clientSecret,
        refreshToken,
      },
    })

    await transporter.sendMail({
      from: `"StrykeFox Website" <${gmailUser}>`,
      to: recipient,
      replyTo: email,
      subject,
      text: [
        `Inquiry Type: ${prettyType}`,
        `Name: ${name}`,
        `Email: ${email}`,
        `Company: ${company || "Not provided"}`,
        `Phone: ${phone || "Not provided"}`,
        "",
        "Message:",
        message,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2 style="margin:0 0 16px">New Website Inquiry</h2>
          <p><strong>Inquiry Type:</strong> ${escapeHtml(prettyType)}</p>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Company:</strong> ${escapeHtml(company || "Not provided")}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
        </div>
      `,
    })

    return NextResponse.json({ status: "ok" })
  } catch {
    return NextResponse.json(
      { error: "Unable to send inquiry." },
      { status: 500 },
    )
  }
}
