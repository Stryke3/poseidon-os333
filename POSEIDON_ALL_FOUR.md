# POSEIDON OS — ALL FOUR PRODUCTION FIXES
# Paste this entire file into Cursor Chat and execute top to bottom.
# Do NOT skip phases. Do NOT patch. Replace entirely.
# ============================================================

You are hardening Poseidon OS for live production use at dashboard.strykefox.com.
Execute all four phases in sequence. Report completion of each phase before starting the next.

---

# ═══════════════════════════════════════════
# PHASE 1 — FIX SEED DATA (correct KPI values)
# ═══════════════════════════════════════════

Find the file that contains the mock/seed data for the dashboard KPI cards.
It will contain values like cleanClaimRate, daysInAR, appealWinRate, outstandingOrders.
It may be named: data.ts, mockData.ts, seed.ts, constants.ts, or inline in a component.

Replace ALL seed values with these production-target numbers:

```typescript
// src/lib/data.ts  (create this file if it doesn't exist)
// Single source of truth for all seed/mock data

export const KPI_DATA = {
  cleanClaimRate: { value: 97.2, delta: '+0.8 pts', trend: 'up' },
  daysInAR:       { value: 18.4, delta: '-4.2 days', trend: 'up' },
  appealWinRate:  { value: 88.0, delta: '+3.4%', trend: 'up' },
  outstandingOrders: { value: 47, urgent: 7, trend: 'neutral' },
}

export const PIPELINE_DATA = {
  pendingAuth:  { count: 27, value: '$184,200' },
  authorized:   { count: 89, value: '$612,800' },
  submitted:    { count: 8,  value: '$54,100'  },
  denied:       { count: 5,  value: '$38,400'  },
  appealed:     { count: 14, value: '$142,300' },
  paid:         { count: 174, value: '$1,190,000' },
}

export const SYSTEM_STATE = {
  status: 'operational',
  services: ['Core', 'Trident', 'Intake', 'ML'],
  ports: '8001–8004',
  operators: ['Admin', 'Billing', 'Rep'],
  lastSync: new Date().toISOString(),
}

export const ACCOUNTS = [
  { id: 'ACC-001', name: 'Rosa Alvarez',    payer: 'Aetna',    status: 'active',  value: '$12,400', type: 'DME'      },
  { id: 'ACC-002', name: 'Marcus T.',       payer: 'BCBS',     status: 'pending', value: '$28,100', type: 'Surgical' },
  { id: 'ACC-003', name: 'Linda R.',        payer: 'UHC',      status: 'appeal',  value: '$9,200',  type: 'Biologics'},
  { id: 'ACC-004', name: 'James K.',        payer: 'Medicare', status: 'active',  value: '$4,800',  type: 'DME'      },
  { id: 'ACC-005', name: 'Sarah M.',        payer: 'Cigna',    status: 'denied',  value: '$31,600', type: 'Surgical' },
  { id: 'ACC-006', name: 'Robert A.',       payer: 'Aetna',    status: 'active',  value: '$7,300',  type: 'DME'      },
  { id: 'ACC-007', name: 'Emma P.',         payer: 'Medicaid', status: 'active',  value: '$2,900',  type: 'DME'      },
  { id: 'ACC-008', name: 'David L.',        payer: 'BCBS',     status: 'appeal',  value: '$18,500', type: 'Surgical' },
]

export const KANBAN_DATA: Record<string, KanbanColumn> = {
  pendingAuth: {
    id: 'pendingAuth',
    label: 'Pending Auth',
    color: '#c9921a',
    cards: [
      { id: 'K-001', title: 'Power Wheelchair L8000 — Medicare', value: '$4,800', priority: 'high', assignee: 'RC', payer: 'Medicare', type: 'DME',      due: '2026-03-20' },
      { id: 'K-002', title: 'ACL Reconstruction Biologics Bundle', value: '$19,200', priority: 'high', assignee: 'KL', payer: 'Aetna',    type: 'Surgical', due: '2026-03-22' },
      { id: 'K-003', title: 'TENS Unit — BCBS prior auth',        value: '$1,200',  priority: 'low',  assignee: 'MM', payer: 'BCBS',     type: 'DME',      due: '2026-03-25' },
    ]
  },
  authorized: {
    id: 'authorized',
    label: 'Authorized',
    color: '#1a6ef5',
    cards: [
      { id: 'K-004', title: 'Spinal Cord Stimulator — UHC',    value: '$34,500', priority: 'high', assignee: 'RC', payer: 'UHC',      type: 'Surgical', due: '2026-03-18' },
      { id: 'K-005', title: 'Knee Brace x2 — Cigna verified',  value: '$2,900',  priority: 'med',  assignee: 'JA', payer: 'Cigna',    type: 'DME',      due: '2026-03-19' },
      { id: 'K-006', title: 'Hospital Bed + Rails — Medicaid',  value: '$3,400',  priority: 'med',  assignee: 'RC', payer: 'Medicaid', type: 'DME',      due: '2026-03-21' },
    ]
  },
  submitted: {
    id: 'submitted',
    label: 'Submitted',
    color: '#0d9eaa',
    cards: [
      { id: 'K-007', title: 'Hip Replacement Implant — Medicare', value: '$28,100', priority: 'high', assignee: 'KL', payer: 'Medicare', type: 'Surgical', due: '2026-03-17' },
      { id: 'K-008', title: 'CPAP w/ Humidifier — ResMed',       value: '$2,200',  priority: 'med',  assignee: 'MM', payer: 'Aetna',    type: 'DME',      due: '2026-03-18' },
    ]
  },
  denied: {
    id: 'denied',
    label: 'Denied',
    color: '#e03a3a',
    cards: [
      { id: 'K-009', title: 'CPAP denial — UHC medical necessity', value: '$2,200',  priority: 'high', assignee: 'JA', payer: 'UHC',      type: 'DME',      due: '2026-03-16' },
      { id: 'K-010', title: 'Biologics denial — wrong DX code',   value: '$11,600', priority: 'high', assignee: 'RC', payer: 'BCBS',     type: 'Biologics', due: '2026-03-18' },
    ]
  },
  appealed: {
    id: 'appealed',
    label: 'Appealed',
    color: '#7c5af0',
    cards: [
      { id: 'K-011', title: 'L1 Appeal — Spinal Stim UHC',     value: '$34,500', priority: 'high', assignee: 'RC', payer: 'UHC',  type: 'Surgical',  due: '2026-03-20' },
      { id: 'K-012', title: 'Trident appeal — Biologics BCBS', value: '$11,600', priority: 'high', assignee: 'KL', payer: 'BCBS', type: 'Biologics',  due: '2026-03-22' },
    ]
  },
}

export interface KanbanCard {
  id: string
  title: string
  value: string
  priority: 'high' | 'med' | 'low'
  assignee: string
  payer: string
  type: string
  due: string
}

export interface KanbanColumn {
  id: string
  label: string
  color: string
  cards: KanbanCard[]
}
```

After creating/updating this file:
- Find every hardcoded KPI value in all components and replace with imports from this file
- Find every hardcoded kanban card array and replace with imports from this file
- Verify the dashboard KPI cards now show: 97.2% clean claim, 18.4 days AR, 88% appeal win rate

---

# ═══════════════════════════════════════════
# PHASE 2 — KANBAN DRAG AND DROP
# ═══════════════════════════════════════════

Find the Kanban/worklist component. It may be named:
KanbanColumn, WorklistLanes, OperationalQueue, poseidon-rep-kanban.jsx, or similar.

Rewrite it with full drag-and-drop using the HTML5 Drag and Drop API (no external libraries).
Use the KANBAN_DATA from src/lib/data.ts as the data source.

```typescript
// src/components/kanban/KanbanBoard.tsx
"use client"

import { useState, useCallback } from 'react'
import { KANBAN_DATA, KanbanCard, KanbanColumn } from '@/lib/data'

export default function KanbanBoard() {
  const [columns, setColumns] = useState(KANBAN_DATA)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingFromCol, setDraggingFromCol] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleDragStart = useCallback((cardId: string, colId: string) => {
    setDraggingId(cardId)
    setDraggingFromCol(colId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetColId: string) => {
    e.preventDefault()
    setDragOverCol(null)
    if (!draggingId || !draggingFromCol || draggingFromCol === targetColId) {
      setDraggingId(null)
      setDraggingFromCol(null)
      return
    }
    setColumns(prev => {
      const next = { ...prev }
      const srcCards = [...next[draggingFromCol].cards]
      const idx = srcCards.findIndex(c => c.id === draggingId)
      if (idx === -1) return prev
      const [moved] = srcCards.splice(idx, 1)
      next[draggingFromCol] = { ...next[draggingFromCol], cards: srcCards }
      next[targetColId] = { ...next[targetColId], cards: [...next[targetColId].cards, moved] }
      return next
    })
    const targetLabel = KANBAN_DATA[targetColId]?.label || targetColId
    showToast(`${draggingId} moved to ${targetLabel}`)
    setDraggingId(null)
    setDraggingFromCol(null)
  }, [draggingId, draggingFromCol])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDraggingFromCol(null)
    setDragOverCol(null)
  }, [])

  const priorityStyles: Record<string, { bg: string; color: string }> = {
    high: { bg: 'rgba(224,58,58,0.15)',   color: '#e03a3a' },
    med:  { bg: 'rgba(212,130,15,0.15)',  color: '#d4820f' },
    low:  { bg: 'rgba(15,168,106,0.15)',  color: '#0fa86a' },
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          background: '#0f1525', border: '1px solid #0fa86a',
          color: '#0fa86a', padding: '10px 18px', borderRadius: 5,
          fontSize: 12, fontWeight: 500,
        }}>
          ✓ {toast}
        </div>
      )}

      {/* BOARD */}
      <div style={{
        display: 'flex', gap: 14, overflowX: 'auto',
        padding: '16px 20px', minHeight: 500,
      }}>
        {Object.values(columns).map(col => (
          <div
            key={col.id}
            style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {/* COLUMN HEADER */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: 5,
              background: col.color + '18',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: col.color }}>
                {col.label}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                background: col.color + '25', color: col.color,
              }}>
                {col.cards.length}
              </span>
            </div>

            {/* DROP ZONE */}
            <div
              onDragOver={e => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: 8,
                padding: 4, borderRadius: 5, minHeight: 80,
                background: dragOverCol === col.id ? 'rgba(26,110,245,0.08)' : 'transparent',
                transition: 'background 0.15s',
                border: dragOverCol === col.id ? '1px dashed rgba(26,110,245,0.4)' : '1px solid transparent',
              }}
            >
              {col.cards.map(card => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => handleDragStart(card.id, col.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    background: '#0f1525',
                    border: `1px solid ${draggingId === card.id ? 'rgba(26,110,245,0.6)' : 'rgba(40,90,180,0.18)'}`,
                    borderRadius: 5, padding: '10px 12px',
                    cursor: 'grab', userSelect: 'none',
                    opacity: draggingId === card.id ? 0.4 : 1,
                    transform: draggingId === card.id ? 'rotate(1.5deg)' : 'none',
                    transition: 'opacity 0.15s, border-color 0.15s',
                  }}
                >
                  {/* CARD TOP */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#4a6a90' }}>{card.id}</span>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 10,
                      background: priorityStyles[card.priority].bg,
                      color: priorityStyles[card.priority].color,
                    }}>
                      {card.priority.toUpperCase()}
                    </span>
                  </div>

                  {/* VALUE */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f0b432', marginBottom: 4 }}>
                    {card.value}
                  </div>

                  {/* TITLE */}
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#c8dff5', lineHeight: 1.35, marginBottom: 8 }}>
                    {card.title}
                  </div>

                  {/* TAGS */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 10,
                      background: 'rgba(26,110,245,0.1)', color: '#1a6ef5',
                      border: '1px solid rgba(26,110,245,0.2)',
                    }}>
                      {card.type}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 10,
                      background: 'rgba(74,106,144,0.15)', color: '#7a9bc4',
                    }}>
                      {card.payer}
                    </span>
                  </div>

                  {/* FOOTER */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: '#1a6ef5', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff',
                    }}>
                      {card.assignee}
                    </div>
                    <span style={{
                      fontSize: 10,
                      color: new Date(card.due) < new Date() ? '#e03a3a' : '#4a6a90',
                    }}>
                      {card.due}
                    </span>
                  </div>
                </div>
              ))}

              {/* ADD CARD BUTTON */}
              <button
                style={{
                  padding: '6px 10px', borderRadius: 5,
                  border: '1px dashed rgba(40,90,180,0.25)',
                  background: 'transparent', color: '#4a6a90',
                  fontSize: 11, cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => {
                  (e.target as HTMLButtonElement).style.borderColor = '#1a6ef5'
                  ;(e.target as HTMLButtonElement).style.color = '#1a6ef5'
                }}
                onMouseOut={e => {
                  (e.target as HTMLButtonElement).style.borderColor = 'rgba(40,90,180,0.25)'
                  ;(e.target as HTMLButtonElement).style.color = '#4a6a90'
                }}
              >
                + Add card
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Import and use this component wherever the worklist/kanban currently renders.
Delete the old kanban component entirely. Do not keep both.

---

# ═══════════════════════════════════════════
# PHASE 3 — TRIDENT API WIRING LAYER
# ═══════════════════════════════════════════

Create the API abstraction layer. This sits between the UI and the real Trident backend.
Right now it returns seed data. When Trident API is ready, swap the return values — UI touches nothing.

```typescript
// src/lib/api.ts
// Trident API client — single source of truth for all data fetching
// Currently returns seed data. Wire to real endpoints when backend is ready.

import { KPI_DATA, PIPELINE_DATA, ACCOUNTS, KANBAN_DATA, SYSTEM_STATE } from './data'

const TRIDENT_BASE = process.env.NEXT_PUBLIC_TRIDENT_API_URL || ''
const IS_LIVE = !!TRIDENT_BASE

async function tridentFetch(endpoint: string, options?: RequestInit) {
  if (!IS_LIVE) return null  // fall through to seed data
  const res = await fetch(`${TRIDENT_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_TRIDENT_TOKEN || ''}`,
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`Trident API error: ${res.status} ${endpoint}`)
  return res.json()
}

// ─── KPI METRICS ─────────────────────────────────────────────
export async function getKPIs() {
  const live = await tridentFetch('/v1/metrics/kpi').catch(() => null)
  return live ?? KPI_DATA
}

// ─── PIPELINE ────────────────────────────────────────────────
export async function getPipeline() {
  const live = await tridentFetch('/v1/claims/pipeline').catch(() => null)
  return live ?? PIPELINE_DATA
}

// ─── KANBAN / WORKLIST ────────────────────────────────────────
export async function getKanbanData() {
  const live = await tridentFetch('/v1/worklist/kanban').catch(() => null)
  return live ?? KANBAN_DATA
}

// ─── ACCOUNTS ────────────────────────────────────────────────
export async function getAccounts() {
  const live = await tridentFetch('/v1/accounts').catch(() => null)
  return live ?? ACCOUNTS
}

// ─── SYSTEM STATE ─────────────────────────────────────────────
export async function getSystemState() {
  const live = await tridentFetch('/v1/system/state').catch(() => null)
  return live ?? SYSTEM_STATE
}

// ─── MOVE KANBAN CARD ─────────────────────────────────────────
export async function moveKanbanCard(cardId: string, fromCol: string, toCol: string) {
  if (IS_LIVE) {
    await tridentFetch('/v1/worklist/move', {
      method: 'POST',
      body: JSON.stringify({ cardId, fromCol, toCol }),
    }).catch(console.error)
  }
  // Optimistic update handled by UI state regardless
  return { success: true }
}

// ─── TRIDENT INTELLIGENCE QUERY ───────────────────────────────
export async function queryTrident(prompt: string) {
  if (IS_LIVE) {
    const live = await tridentFetch('/v1/trident/query', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }).catch(() => null)
    if (live) return live
  }
  // Fallback: route through Anthropic directly
  const res = await fetch('/api/trident', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  return res.json()
}
```

Then create the Trident API route that calls Anthropic when backend isn't live:

```typescript
// src/app/api/trident/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are Trident, the intelligence engine for Poseidon OS at StrykeFox Medical.
You analyze healthcare reimbursement data, DME claims, surgical case billing, and denial patterns.
Respond with clinical precision. Lead with the key finding. Be specific about dollar amounts, percentages, and action items.
Format: finding → risk → recommended action. Keep responses under 200 words.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || 'Trident analysis unavailable.'
  return NextResponse.json({ response: text })
}
```

Add to .env.local:
```
ANTHROPIC_API_KEY=your_key_here
NEXT_PUBLIC_TRIDENT_API_URL=
NEXT_PUBLIC_TRIDENT_TOKEN=
```

---

# ═══════════════════════════════════════════
# PHASE 4 — AUTH (password protect the dashboard)
# ═══════════════════════════════════════════

Install next-auth:
```bash
cd frontend && npm install next-auth --legacy-peer-deps
```

Create the auth config:

```typescript
// src/lib/auth.ts
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

// Team credentials — move to env vars / database before scaling
const TEAM = [
  { id: '1', name: 'J. Adams',    email: 'adams@strykefoxmedical.com',   role: 'admin',   password: process.env.ADMIN_PASSWORD    || 'poseidon-admin-2026'   },
  { id: '2', name: 'Billing Ops', email: 'billing@strykefoxmedical.com', role: 'billing', password: process.env.BILLING_PASSWORD  || 'poseidon-billing-2026' },
  { id: '3', name: 'Rep Access',  email: 'rep@strykefoxmedical.com',     role: 'rep',     password: process.env.REP_PASSWORD      || 'poseidon-rep-2026'     },
]

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Poseidon OS',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = TEAM.find(
          u => u.email === credentials.email && u.password === credentials.password
        )
        if (!user) return null
        return { id: user.id, name: user.name, email: user.email, role: user.role } as any
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },  // 8 hour sessions
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as any).role
      return token
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).role = token.role
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'poseidon-secret-change-in-production',
}
```

Create the NextAuth API route:
```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'
const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

Create the login page:
```typescript
// src/app/login/page.tsx
"use client"
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      setError('Invalid credentials. Contact your administrator.')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#05080f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        width: 400, background: '#0a0e1a',
        border: '1px solid rgba(40,90,180,0.25)',
        borderRadius: 8, padding: '40px 36px',
      }}>
        {/* LOGO */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Bebas Neue', Impact, sans-serif",
            fontSize: 32, letterSpacing: 4, color: '#fff',
          }}>
            POSEIDON
          </div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: '#4a6a90', marginTop: 4 }}>
            STRYKE FOX MEDICAL · SECURE ACCESS
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, color: '#4a6a90', letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@strykefoxmedical.com" required
              style={{
                width: '100%', background: '#0f1525',
                border: '1px solid rgba(40,90,180,0.25)', borderRadius: 4,
                padding: '9px 12px', color: '#c8dff5', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, color: '#4a6a90', letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••" required
              style={{
                width: '100%', background: '#0f1525',
                border: '1px solid rgba(40,90,180,0.25)', borderRadius: 4,
                padding: '9px 12px', color: '#c8dff5', fontSize: 13, outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(224,58,58,0.1)', border: '1px solid rgba(224,58,58,0.3)',
              borderRadius: 4, padding: '8px 12px', fontSize: 12,
              color: '#e03a3a', marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '11px', borderRadius: 4,
              background: loading ? '#0f3a7a' : '#1a6ef5',
              border: 'none', color: '#fff', fontSize: 13,
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: 1, transition: 'background 0.15s',
            }}
          >
            {loading ? 'AUTHENTICATING...' : 'ACCESS POSEIDON'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10, color: '#2a3a50' }}>
          STRYKE FOX MEDICAL · HIPAA COMPLIANT · ENCRYPTED SESSION
        </div>
      </div>
    </div>
  )
}
```

Create middleware to protect all routes:
```typescript
// middleware.ts  (at project root, NOT inside src/)
export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}
```

Wrap the root layout with SessionProvider:
```typescript
// src/app/providers.tsx
"use client"
import { SessionProvider } from 'next-auth/react'
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

Update src/app/layout.tsx to use Providers:
```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'Poseidon OS — StrykeFox Medical',
  description: 'Clinical Revenue Command',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

Add to .env.local:
```
NEXTAUTH_SECRET=poseidon-production-secret-change-this-now
NEXTAUTH_URL=https://dashboard.strykefox.com
ADMIN_PASSWORD=set-your-secure-password-here
BILLING_PASSWORD=set-your-secure-password-here
REP_PASSWORD=set-your-secure-password-here
```

---

# ═══════════════════════════════════════════
# PHASE 5 — BUILD AND DEPLOY
# ═══════════════════════════════════════════

After completing all four phases above:

```bash
# 1. Verify build is clean
cd frontend && npm run build

# 2. If build passes — deploy to production
vercel --prod --yes

# 3. Add new env vars to Vercel
vercel env add NEXTAUTH_SECRET production
vercel env add NEXTAUTH_URL production
vercel env add ANTHROPIC_API_KEY production
vercel env add ADMIN_PASSWORD production
vercel env add BILLING_PASSWORD production
vercel env add REP_PASSWORD production

# 4. Redeploy with env vars applied
vercel --prod --yes
```

---

# VERIFICATION CHECKLIST

After deploy, confirm:
- [ ] https://dashboard.strykefox.com redirects to /login when not authenticated
- [ ] Login works with adams@strykefoxmedical.com + your admin password
- [ ] Dashboard loads after login with correct KPI values (97.2%, 18.4 days, 88%)
- [ ] Kanban cards drag between columns and show toast confirmation
- [ ] Trident query box returns AI analysis
- [ ] Refreshing the page keeps the session active
- [ ] Incognito window is blocked and redirected to /login

If any step fails — report the exact error. Do not patch. Fix from root cause.
