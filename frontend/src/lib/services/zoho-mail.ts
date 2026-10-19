type MailAttachment = { filename: string; content: string | Buffer; contentType: string }
type BusinessMail = { to: string; replyTo?: string; subject: string; text?: string; html?: string; attachments?: MailAttachment[] }
type Env = Record<string, string | undefined>

function configuration(env: Env) {
  const required = ["ZOHO_OAUTH_CLIENT_ID", "ZOHO_OAUTH_CLIENT_SECRET", "ZOHO_OAUTH_REFRESH_TOKEN", "ZOHO_MAIL_ACCOUNT_ID", "EMAIL_INTAKE_USERNAME"] as const
  if ((env.EMAIL_PROVIDER || "zoho").trim().toLowerCase() !== "zoho" || required.some(key => !env[key]?.trim())) {
    throw new Error("Zoho Mail is not configured.")
  }
  const region = env.ZOHO_REGION?.trim() || "com"
  if (!["com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"].includes(region)) throw new Error("Zoho region is invalid.")
  const accountId = env.ZOHO_MAIL_ACCOUNT_ID!.trim()
  const sender = env.EMAIL_INTAKE_USERNAME!.trim().toLowerCase()
  if (!/^\d+$/.test(accountId) || !/^[^\s@]+@strykefox\.com$/.test(sender)) throw new Error("Zoho sender account is invalid.")
  return { region, accountId, sender, clientId: env.ZOHO_OAUTH_CLIENT_ID!.trim(), clientSecret: env.ZOHO_OAUTH_CLIENT_SECRET!.trim(), refreshToken: env.ZOHO_OAUTH_REFRESH_TOKEN!.trim() }
}

export function businessMailConfigured(env: Env = process.env) {
  try { configuration(env); return true } catch { return false }
}

// No automatic retries: a send timeout must be reconciled in Zoho before resending.
export async function sendBusinessMail(mail: BusinessMail, request: typeof fetch = fetch, env: Env = process.env) {
  const config = configuration(env)
  const tokenResponse = await request(`https://accounts.zoho.${config.region}/oauth/v2/token`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: "refresh_token" }),
  })
  const token = await tokenResponse.json().catch(() => null)
  if (!tokenResponse.ok || typeof token?.access_token !== "string" || !token.access_token) throw new Error("Zoho Mail authentication failed.")
  const headers = { Authorization: `Zoho-oauthtoken ${token.access_token}`, Accept: "application/json" }
  const origin = `https://mail.zoho.${config.region}`
  async function api(path: string, init: RequestInit = {}) {
    const response = await request(origin + path, { ...init, redirect: "error", signal: AbortSignal.timeout(30000), headers: { ...headers, ...init.headers } })
    const payload = await response.json().catch(() => null)
    if (!response.ok || typeof payload?.status?.code !== "number" || payload.status.code < 200 || payload.status.code >= 300) {
      throw new Error("Zoho Mail request was not confirmed; reconcile outbound mail before retrying.")
    }
    return payload.data
  }
  const accounts = await api("/api/accounts")
  const account = Array.isArray(accounts) ? accounts.find(item => String(item.accountId) === config.accountId) : null
  const addresses = account ? [account.primaryEmailAddress, account.mailboxAddress, account.incomingUserName,
    ...(Array.isArray(account.emailAddress) ? account.emailAddress.filter((item: { isConfirmed?: boolean }) => item.isConfirmed === true).map((item: { mailId?: string }) => item.mailId) : [])] : []
  if (!addresses.some(address => String(address || "").toLowerCase() === config.sender)) throw new Error("Zoho mailbox does not match the configured sender.")
  const base = `/api/accounts/${config.accountId}/messages`
  const attachments: { storeName: string; attachmentName: string; attachmentPath: string }[] = []
  for (const attachment of mail.attachments || []) {
    const form = new FormData()
    const bytes = typeof attachment.content === "string" ? Buffer.from(attachment.content, "utf-8") : attachment.content
    form.append("attach", new Blob([new Uint8Array(bytes)], { type: attachment.contentType }), attachment.filename)
    const uploaded = await api(base + "/attachments?uploadType=multipart&isInline=false", { method: "POST", body: form })
    if (!Array.isArray(uploaded) || uploaded.length !== 1 || !["storeName", "attachmentName", "attachmentPath"].every(key => typeof uploaded[0]?.[key] === "string" && uploaded[0][key])) {
      throw new Error("Zoho attachment upload was not confirmed; email was not sent.")
    }
    const { storeName, attachmentName, attachmentPath } = uploaded[0]
    attachments.push({ storeName, attachmentName, attachmentPath })
  }
  const receipt = await api(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    fromAddress: config.sender, toAddress: mail.to, ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    subject: mail.subject, content: mail.html || mail.text || "", mailFormat: mail.html ? "html" : "plaintext", encoding: "UTF-8",
    ...(attachments.length ? { attachments } : {}),
  }) })
  const messageId = receipt?.messageId
  if ((typeof messageId !== "string" && typeof messageId !== "number") || (typeof messageId === "number" && !Number.isSafeInteger(messageId)) || !String(messageId)) throw new Error("Zoho email acceptance is unconfirmed; reconcile outbound mail before retrying.")
  return { provider: "zoho" as const, messageId: String(messageId), status: "accepted" as const }
}
