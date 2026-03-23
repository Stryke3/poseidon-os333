import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { prompt, context } = await req.json()
  const apiKey = process.env.ANTHROPIC_API_KEY || ""
  const contextSummary = context
    ? `Dashboard context:
- Consolidated patient cards: ${JSON.stringify(context.accounts || [])}
- Pipeline counts: ${JSON.stringify(context.pipeline || {})}`
    : "No dashboard context provided."

  if (!apiKey) {
    return NextResponse.json({
      response:
        "Trident analysis unavailable. Configure ANTHROPIC_API_KEY in the environment to enable live intelligence.",
    })
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6-20250527",
      max_tokens: 1024,
      system: `You are Trident, the intelligence engine for Poseidon OS at StrykeFox Medical.
You analyze healthcare reimbursement data, DME claims, surgical case billing, and denial patterns.
Respond with clinical precision. Lead with the key finding. Be specific about dollar amounts, percentages, and action items.
Format: finding → risk → recommended action. Keep responses under 200 words.

${contextSummary}`,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || "Trident analysis unavailable."

  return NextResponse.json({ response: text })
}
