"use client"

import { useEffect, useState } from "react"

import styles from "./RevenueCommandSurface.module.css"

type ViewKey = "pipeline" | "calendar" | "analytics" | "roster"
type StageKey =
  | "intake"
  | "eligibility"
  | "auth"
  | "submitted"
  | "pending"
  | "denied"
  | "paid"
type CheckKey = "swo" | "notes" | "ins" | "cmn"
type EventType = "ops" | "case" | "intel"

type Patient = {
  id: string
  name: string
  dob: string
  mrn: string
  payer: string
  mid: string
  hcpcs: string
  dx: string
  product: string
  doc: string
  npi: string
  stage: StageKey
  tri: number
  ar: number
  amt: number
  surg: string | null
  org: string
  checks: Record<CheckKey, boolean>
}

type CalendarEvent = {
  id: number
  t: string
  time: string
  dur: number
  type: EventType
  date: string
  who: string
}

type StageMeta = {
  k: StageKey
  l: string
  c: string
  n: number
}

const PATIENTS: Patient[] = [
  { id: "P-4012", name: "Rosa Alvarez", dob: "1958-03-14", mrn: "MRN-4012", payer: "Medicare DMERC", mid: "1EG4-TE5-MK72", hcpcs: "E0601", dx: "G47.33", product: "CPAP System", doc: "Dr. Sarah Chen", npi: "1234567890", stage: "auth", tri: 94, ar: 2, amt: 1847, surg: "2026-03-24", org: "PMP", checks: { swo: true, notes: true, ins: true, cmn: false } },
  { id: "P-4013", name: "James Whitfield", dob: "1971-08-22", mrn: "MRN-4013", payer: "UnitedHealthcare", mid: "UHC-882341", hcpcs: "L1832", dx: "M21.6", product: "Knee Orthosis", doc: "Dr. Mark Rivera", npi: "9876543210", stage: "submitted", tri: 87, ar: 5, amt: 2340, surg: "2026-03-26", org: "Momentum", checks: { swo: true, notes: true, ins: true, cmn: true } },
  { id: "P-4014", name: "Maria Santos", dob: "1965-11-03", mrn: "MRN-4014", payer: "Aetna", mid: "AET-774521", hcpcs: "K0823", dx: "G82.50", product: "Power Wheelchair", doc: "Dr. Lisa Park", npi: "5678901234", stage: "eligibility", tri: 71, ar: 1, amt: 4250, surg: null, org: "Momentum", checks: { swo: false, notes: true, ins: false, cmn: false } },
  { id: "P-4015", name: "David Park", dob: "1982-05-19", mrn: "MRN-4015", payer: "BCBS", mid: "BCB-339201", hcpcs: "A4253", dx: "E11.65", product: "Glucose Strips", doc: "Dr. Amy Tran", npi: "3456789012", stage: "paid", tri: 96, ar: 12, amt: 890, surg: null, org: "LVCO", checks: { swo: true, notes: true, ins: true, cmn: true } },
  { id: "P-4016", name: "Linda Okafor", dob: "1974-09-08", mrn: "MRN-4016", payer: "Cigna", mid: "CIG-551823", hcpcs: "E0470", dx: "J44.1", product: "BiPAP System", doc: "Dr. Sarah Chen", npi: "1234567890", stage: "pending", tri: 82, ar: 8, amt: 3120, surg: "2026-03-28", org: "PMP", checks: { swo: true, notes: true, ins: true, cmn: true } },
  { id: "P-4017", name: "Robert Chen", dob: "1969-02-27", mrn: "MRN-4017", payer: "Humana", mid: "HUM-229134", hcpcs: "E2402", dx: "G12.21", product: "Speech Device", doc: "Dr. James Ortiz", npi: "7890123456", stage: "intake", tri: 78, ar: 0, amt: 5680, surg: "2026-04-02", org: "PMP", checks: { swo: false, notes: false, ins: false, cmn: false } },
  { id: "P-4018", name: "Angela Williams", dob: "1955-07-16", mrn: "MRN-4018", payer: "Medicare DMERC", mid: "1FH7-QW3-NR89", hcpcs: "E0601", dx: "G47.33", product: "CPAP + Humidifier", doc: "Dr. Lisa Park", npi: "5678901234", stage: "auth", tri: 91, ar: 3, amt: 2100, surg: "2026-03-25", org: "PMP", checks: { swo: true, notes: true, ins: true, cmn: false } },
  { id: "P-4019", name: "Thomas Jackson", dob: "1988-12-01", mrn: "MRN-4019", payer: "Molina", mid: "MOL-881245", hcpcs: "L3000", dx: "M72.2", product: "Foot Orthosis", doc: "Dr. Mark Rivera", npi: "9876543210", stage: "denied", tri: 44, ar: 18, amt: 1560, surg: null, org: "Momentum", checks: { swo: true, notes: false, ins: true, cmn: false } },
  { id: "P-4020", name: "Patricia Nguyen", dob: "1963-04-11", mrn: "MRN-4020", payer: "Aetna", mid: "AET-663289", hcpcs: "A6531", dx: "L97.529", product: "Wound Care Kit", doc: "Dr. Amy Tran", npi: "3456789012", stage: "submitted", tri: 88, ar: 4, amt: 760, surg: null, org: "LVCO", checks: { swo: true, notes: true, ins: true, cmn: true } },
  { id: "P-4021", name: "Michael Reeves", dob: "1977-10-30", mrn: "MRN-4021", payer: "UnitedHealthcare", mid: "UHC-441297", hcpcs: "E0784", dx: "G47.33", product: "Infusion Pump", doc: "Dr. Sarah Chen", npi: "1234567890", stage: "pending", tri: 85, ar: 6, amt: 3890, surg: "2026-04-01", org: "LVCO", checks: { swo: true, notes: true, ins: true, cmn: true } },
  { id: "P-4022", name: "Sandra Gomez", dob: "1960-06-05", mrn: "MRN-4022", payer: "BCBS", mid: "BCB-772318", hcpcs: "K0856", dx: "G80.0", product: "Power Chair Custom", doc: "Dr. James Ortiz", npi: "7890123456", stage: "auth", tri: 76, ar: 7, amt: 8900, surg: "2026-04-04", org: "Momentum", checks: { swo: true, notes: true, ins: false, cmn: false } },
  { id: "P-4023", name: "Kevin Marshall", dob: "1985-01-18", mrn: "MRN-4023", payer: "Cigna", mid: "CIG-338812", hcpcs: "E0260", dx: "L89.154", product: "Hospital Bed", doc: "Dr. Lisa Park", npi: "5678901234", stage: "paid", tri: 93, ar: 15, amt: 2750, surg: null, org: "PMP", checks: { swo: true, notes: true, ins: true, cmn: true } },
]

const EVENTS: CalendarEvent[] = [
  { id: 1, t: "Revenue Command Brief", time: "08:00", dur: 30, type: "ops", date: "2026-03-21", who: "All Ops" },
  { id: 2, t: "PMP Auth Sprint", time: "09:30", dur: 60, type: "ops", date: "2026-03-21", who: "Billing" },
  { id: 3, t: "CPAP Fitting - Alvarez", time: "11:00", dur: 45, type: "case", date: "2026-03-21", who: "Dr. Chen" },
  { id: 4, t: "LVCO CO-4 Analysis", time: "13:00", dur: 45, type: "intel", date: "2026-03-21", who: "Jessica T." },
  { id: 5, t: "Momentum Onboard", time: "15:00", dur: 60, type: "ops", date: "2026-03-21", who: "Marcus W." },
  { id: 6, t: "BiPAP - Okafor", time: "10:00", dur: 45, type: "case", date: "2026-03-24", who: "Dr. Chen" },
  { id: 7, t: "Chair ATP - Gomez", time: "14:00", dur: 90, type: "case", date: "2026-03-25", who: "Dr. Ortiz" },
  { id: 8, t: "Knee Fit - Whitfield", time: "09:00", dur: 60, type: "case", date: "2026-03-26", who: "Dr. Rivera" },
  { id: 9, t: "BiPAP Del - Okafor", time: "14:00", dur: 30, type: "case", date: "2026-03-28", who: "Tech" },
  { id: 10, t: "Infusion - Reeves", time: "10:00", dur: 60, type: "case", date: "2026-04-01", who: "Dr. Chen" },
  { id: 11, t: "Speech Eval - R. Chen", time: "11:00", dur: 60, type: "case", date: "2026-04-02", who: "Dr. Ortiz" },
  { id: 12, t: "Chair Del - Gomez", time: "13:00", dur: 45, type: "case", date: "2026-04-04", who: "Tech" },
]

const STAGES: StageMeta[] = [
  { k: "intake", l: "01_INTAKE", c: "#2dd4bf", n: 0 },
  { k: "eligibility", l: "02_ELIG", c: "#a78bfa", n: 1 },
  { k: "auth", l: "03_AUTH_CMN", c: "#fbbf24", n: 2 },
  { k: "submitted", l: "04_SUBMITTED", c: "#38bdf8", n: 3 },
  { k: "pending", l: "05_PEND_PAY", c: "#fb923c", n: 4 },
  { k: "denied", l: "06_DENIED", c: "#f87171", n: 5 },
  { k: "paid", l: "07_PAID", c: "#4ade80", n: 6 },
]

const STAGE_MAP = Object.fromEntries(STAGES.map((stage) => [stage.k, stage])) as Record<StageKey, StageMeta>
const TODAY = "2026-03-21"

function triColor(value: number) {
  if (value >= 85) return "#4ade80"
  if (value >= 65) return "#fbbf24"
  return "#f87171"
}

function eventColor(type: EventType) {
  if (type === "case") return "#8b5cf6"
  if (type === "intel") return "#22d3ee"
  return "#f59e0b"
}

function formatDayLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

function buildGoogleCalendarUrl(title: string, details: string) {
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}`
}

function downloadIcs(title: string, duration: number, description: string) {
  const file = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `SUMMARY:${title}`,
    `DURATION:PT${duration}M`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n")

  const blob = new Blob([file], { type: "text/calendar" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${title.replace(/\s+/g, "_")}.ics`
  anchor.click()
  URL.revokeObjectURL(url)
}

function baseQuickEventDate() {
  return TODAY
}

export default function RevenueCommandSurface() {
  const [patients, setPatients] = useState(PATIENTS)
  const [view, setView] = useState<ViewKey>("pipeline")
  const [search, setSearch] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [patientModalId, setPatientModalId] = useState<string | null>(null)
  const [docModal, setDocModal] = useState<{ title: string; patient: string } | null>(null)
  const [clock, setClock] = useState("00:00:00")
  const [userPct, setUserPct] = useState(0)
  const [calendarMonth, setCalendarMonth] = useState(2)
  const [calendarYear, setCalendarYear] = useState(2026)
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [quickTitle, setQuickTitle] = useState("")
  const [quickDate, setQuickDate] = useState(baseQuickEventDate())
  const [quickTime, setQuickTime] = useState("09:00")
  const [events, setEvents] = useState(EVENTS)
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      )
    }

    tick()
    const intervalId = window.setInterval(tick, 1000)
    const timeoutId = window.setTimeout(() => setUserPct(92), 800)

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        document.getElementById("revenue-search-input")?.focus()
      }

      if (event.key === "Escape") {
        setPatientModalId(null)
        setDocModal(null)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const patientModal = patients.find((patient) => patient.id === patientModalId) || null
  const searchTerm = search.trim().toLowerCase()
  const searchHits =
    searchTerm.length >= 2
      ? patients.filter((patient) =>
          [
            patient.name,
            patient.mrn,
            patient.hcpcs,
            patient.payer,
            patient.product,
            patient.id,
          ]
            .join(" ")
            .toLowerCase()
            .includes(searchTerm),
        )
      : []

  const selectedEvents = events.filter((event) => event.date === selectedDate)
  const surgicalCases = [...patients].filter((patient) => patient.surg).sort((a, b) => (a.surg || "").localeCompare(b.surg || ""))

  const totalAmount = patients.reduce((sum, patient) => sum + patient.amt, 0)
  const avgTri = Math.round(patients.reduce((sum, patient) => sum + patient.tri, 0) / patients.length)
  const deniedCount = patients.filter((patient) => patient.stage === "denied").length
  const paidCount = patients.filter((patient) => patient.stage === "paid").length
  const payerExposure = Object.values(
    patients.reduce<Record<string, { payer: string; total: number; denied: number; pending: number; paid: number }>>(
      (acc, patient) => {
        const current = acc[patient.payer] || {
          payer: patient.payer,
          total: 0,
          denied: 0,
          pending: 0,
          paid: 0,
        }
        current.total += patient.amt
        if (patient.stage === "denied") current.denied += patient.amt
        if (patient.stage === "paid") current.paid += patient.amt
        if (patient.stage !== "paid") current.pending += patient.amt
        acc[patient.payer] = current
        return acc
      },
      {},
    ),
  )
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 5)

  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay()
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const calendarCells = []

  for (let index = 0; index < firstDay; index += 1) {
    calendarCells.push(<div key={`blank-${index}`} className={styles.calDay} />)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const hasEvent = events.some((event) => event.date === dayString)
    const hasSurgery = patients.some((patient) => patient.surg === dayString)
    const isSelected = dayString === selectedDate
    const isToday = dayString === TODAY

    calendarCells.push(
      <button
        key={dayString}
        type="button"
        onClick={() => setSelectedDate(dayString)}
        className={[
          styles.calDay,
          "flex flex-col items-center justify-center rounded-lg text-xs",
          isSelected ? styles.calDaySelected : "",
          isToday && !isSelected ? styles.calDayToday : "",
        ].join(" ")}
      >
        <span>{day}</span>
        {(hasEvent || hasSurgery) && (
          <span className="mt-0.5 flex gap-0.5">
            {hasEvent ? <span className="h-1 w-1 rounded-full bg-amber-500" /> : null}
            {hasSurgery ? <span className="h-1 w-1 rounded-full bg-violet-500" /> : null}
          </span>
        )}
      </button>,
    )
  }

  function togglePatientCheck(patientId: string, key: CheckKey, checked: boolean) {
    setPatients((current) =>
      current.map((patient) =>
        patient.id === patientId
          ? { ...patient, checks: { ...patient.checks, [key]: checked } }
          : patient,
      ),
    )
  }

  function movePatientStage(patientId: string, stage: StageKey) {
    setPatients((current) =>
      current.map((patient) => (patient.id === patientId ? { ...patient, stage } : patient)),
    )
  }

  function toggleCardFlip(patientId: string) {
    setFlippedCards((current) => ({ ...current, [patientId]: !current[patientId] }))
  }

  function navMonth(direction: number) {
    setCalendarMonth((currentMonth) => {
      const nextMonth = currentMonth + direction

      if (nextMonth < 0) {
        setCalendarYear((currentYear) => currentYear - 1)
        return 11
      }

      if (nextMonth > 11) {
        setCalendarYear((currentYear) => currentYear + 1)
        return 0
      }

      return nextMonth
    })
  }

  function createQuickEvent() {
    if (!quickTitle.trim() || !quickDate || !quickTime) return

    setEvents((current) => [
      ...current,
      {
        id: current.length + 1,
        t: quickTitle.trim(),
        time: quickTime,
        dur: 30,
        type: "ops",
        date: quickDate,
        who: "Command Desk",
      },
    ])
    setSelectedDate(quickDate)
    setQuickTitle("")
  }

  const circumference = 2 * Math.PI * 15
  const dashOffset = circumference - (userPct / 100) * circumference

  return (
    <div className={`${styles.surface} relative flex h-screen flex-col overflow-hidden`}>
      <div className={styles.circleBg} />

      <header className="relative z-10 flex flex-shrink-0 flex-col gap-4 border-b border-white/5 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 shadow-lg shadow-teal-500/20">
            <span className={`${styles.mono} text-sm font-bold text-black`}>P</span>
          </div>
          <div>
            <h1 className={`${styles.mono} flex items-center gap-2 text-lg font-bold tracking-tighter text-white`}>
              <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
              POSEIDON // REVENUE_COMMAND
            </h1>
            <p className={`${styles.mono} text-[9px] uppercase tracking-[0.35em] text-zinc-600`}>
              StrykeFox Medical · Trident Intelligence · v7.7
            </p>
          </div>
        </div>

        <div className="relative w-full lg:max-w-xl lg:flex-1 lg:px-8">
          <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/60 px-4 py-2.5 transition-all focus-within:border-teal-500/40 focus-within:shadow-[0_0_20px_rgba(20,184,166,0.06)]">
            <svg className="h-4 w-4 flex-shrink-0 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" x2="16.65" y1="21" y2="16.65" />
            </svg>
            <input
              id="revenue-search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              placeholder="Search patient, MRN, HCPCS, payer..."
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />
            {searchTerm.length < 2 ? (
              <kbd className={`${styles.mono} rounded border border-zinc-700/50 bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-700`}>
                ⌘K
              </kbd>
            ) : null}
          </div>

          {searchFocused && searchHits.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-white/8 bg-zinc-900/95 p-1 shadow-2xl">
              {searchHits.map((patient) => {
                const stage = STAGE_MAP[patient.stage]
                const tri = triColor(patient.tri)

                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setPatientModalId(patient.id)
                      setSearch("")
                      setSearchFocused(false)
                    }}
                    className={`${styles.searchResult} flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold" style={{ backgroundColor: `${tri}12`, color: tri }}>
                      {patient.tri}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                        {patient.name}
                        <span
                          className={`${styles.mono} rounded border px-1.5 py-0.5 text-[8px]`}
                          style={{ backgroundColor: `${stage.c}10`, color: stage.c, borderColor: `${stage.c}25` }}
                        >
                          {stage.l.split("_").pop()}
                        </span>
                      </span>
                      <span className={`${styles.mono} block truncate text-[10px] text-zinc-600`}>
                        {patient.hcpcs} · {patient.payer} · {patient.product}
                      </span>
                    </span>
                    <span className={`${styles.mono} text-xs font-bold text-zinc-400`}>${patient.amt.toLocaleString()}</span>
                  </button>
                )
              })}
            </div>
          ) : searchFocused && searchTerm.length >= 2 ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-white/8 bg-zinc-900/95 p-6 text-center text-xs text-zinc-600 shadow-2xl">
              No matches for "{search}"
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-5 lg:justify-end">
          <div className={`${styles.mono} text-xs text-zinc-600`}>{clock}</div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-2 pr-5">
            <div className="relative h-11 w-11">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="2.5" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#14b8a6"
                  strokeWidth="2.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 1.5s ease" }}
                />
              </svg>
              <div className={`${styles.mono} absolute inset-0 flex items-center justify-center text-[9px] text-teal-400`}>
                {userPct}%
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-200">Adam Stryker</div>
              <div className={`${styles.mono} text-[9px] text-zinc-600`}>ROLE: ADMIN // PORTFOLIO_CMD</div>
            </div>
          </div>
        </div>
      </header>

      <nav className="relative z-10 flex flex-shrink-0 gap-1 overflow-x-auto px-4 pt-3 lg:px-8">
        {[
          ["pipeline", "Pipeline"],
          ["calendar", "Calendar"],
          ["analytics", "Analytics"],
          ["roster", "Roster"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key as ViewKey)}
            className={[
              styles.tabBtn,
              styles.mono,
              "rounded-t-lg border border-b-0 px-5 py-2 text-[10px] uppercase tracking-widest",
              view === key
                ? `${styles.tabBtnActive} border-white/5`
                : "border-transparent text-zinc-600",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="relative z-10 flex-1 overflow-hidden border-t border-white/5">
        {view === "pipeline" ? (
          <div className="h-full overflow-x-auto">
            <div className="flex h-full min-w-max gap-4 p-6">
              {STAGES.map((stage) => {
                const patientsInStage = patients.filter((patient) => patient.stage === stage.k)

                return (
                  <div key={stage.k} className="flex w-[260px] flex-shrink-0 flex-col">
                    <div className="mb-4 flex items-center justify-between px-2">
                      <h2 className={`${styles.mono} text-[10px] font-bold uppercase tracking-widest`} style={{ color: stage.c }}>
                        {stage.l}
                      </h2>
                      <span className={`${styles.mono} flex h-6 w-6 items-center justify-center rounded-full border border-white/8 bg-zinc-900 text-[10px] text-zinc-500`}>
                        {patientsInStage.length}
                      </span>
                    </div>
                    <div
                      className={`${styles.kanbanCol} space-y-3 rounded-2xl bg-white/[0.01] p-1`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggingId) movePatientStage(draggingId, stage.k)
                        setDraggingId(null)
                      }}
                    >
                      {patientsInStage.map((patient) => {
                        const tri = triColor(patient.tri)
                        const checkCount = Object.values(patient.checks).filter(Boolean).length

                        return (
                          <div
                            key={patient.id}
                            draggable
                            onDragStart={() => setDraggingId(patient.id)}
                            onDragEnd={() => setDraggingId(null)}
                            className={styles.flipContainer}
                          >
                            <div className={`${styles.flipInner} ${flippedCards[patient.id] ? styles.isFlipped : ""}`}>
                              <div className={styles.flipFace}>
                                <div className={styles.gloss} />
                                <button
                                  type="button"
                                  onClick={() => toggleCardFlip(patient.id)}
                                  className="relative z-10 block h-full w-full text-left"
                                >
                                  <div className="mb-2 flex items-start justify-between">
                                    <span className={`${styles.mono} text-[9px]`} style={{ color: stage.c }}>
                                      {patient.id}
                                    </span>
                                    <span
                                      className={`${styles.mono} rounded border px-2 py-0.5 text-[9px]`}
                                      style={{ backgroundColor: `${stage.c}10`, color: stage.c, borderColor: `${stage.c}30` }}
                                    >
                                      {stage.l.split("_").pop()}
                                    </span>
                                  </div>
                                  <h3 className="text-sm font-semibold text-zinc-100">{patient.name}</h3>
                                  <p className="mt-1 text-[10px] text-zinc-500">
                                    {patient.product} · {patient.hcpcs}
                                  </p>
                                  <p className="text-[10px] text-zinc-600">{patient.payer}</p>
                                  <div className="absolute bottom-3 left-4 right-4 mt-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`${styles.mono} flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold`}
                                        style={{ backgroundColor: `${tri}15`, color: tri }}
                                      >
                                        {patient.tri}
                                      </span>
                                      <span className={`${styles.mono} text-[9px] text-zinc-600`}>{patient.ar}d AR</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className={`${styles.mono} text-[9px] text-zinc-600`}>{checkCount}/4</span>
                                      <span className={`${styles.mono} text-[8px] text-zinc-700`}>TAP→</span>
                                    </div>
                                  </div>
                                </button>
                              </div>

                              <div className={`${styles.flipFace} ${styles.flipBack} flex flex-col`}>
                                <div className={styles.gloss} />
                                <div className="relative z-10 mb-3 flex items-center justify-between border-b border-white/8 pb-2">
                                  <span className={`${styles.mono} text-[9px] font-bold`} style={{ color: stage.c }}>
                                    CHART_AUDIT // {patient.id}
                                  </span>
                                  <button type="button" onClick={() => toggleCardFlip(patient.id)} className={`${styles.mono} text-[8px] text-zinc-600`}>
                                    FLIP BACK →
                                  </button>
                                </div>
                                <div className="relative z-10 flex-1 space-y-2">
                                  {[
                                    ["swo", "SWO Received"],
                                    ["notes", "Clinical Notes"],
                                    ["ins", "Insurance Verified"],
                                    ["cmn", "CMN/LMN Complete"],
                                  ].map(([key, label]) => (
                                    <label key={key} className="flex cursor-pointer items-center gap-3 text-[11px] text-zinc-400 transition hover:text-white">
                                      <input
                                        type="checkbox"
                                        checked={patient.checks[key as CheckKey]}
                                        onChange={(event) => togglePatientCheck(patient.id, key as CheckKey, event.target.checked)}
                                        className="h-3.5 w-3.5 accent-[#14b8a6]"
                                      />
                                      {label}
                                    </label>
                                  ))}
                                </div>
                                <div className="relative z-10 mt-3 grid grid-cols-3 gap-2">
                                  {["SWO", "CMS-1500", "POD"].map((type) => (
                                    <button
                                      key={type}
                                      type="button"
                                      onClick={() => setDocModal({ title: type, patient: patient.name })}
                                      className={`${styles.mono} rounded-lg border border-white/8 bg-white/5 py-2 text-[8px] font-bold uppercase tracking-wider transition hover:border-teal-500 hover:bg-teal-500 hover:text-black`}
                                    >
                                      {type === "CMS-1500" ? "CMS" : type}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setPatientModalId(patient.id)}
                                  className={`${styles.mono} relative z-10 mt-2 w-full rounded-lg border border-teal-500/20 bg-gradient-to-r from-teal-500/20 to-cyan-500/10 py-2 text-[9px] font-bold uppercase tracking-widest text-teal-400 transition hover:from-teal-500 hover:to-cyan-400 hover:text-black`}
                                >
                                  Full Profile →
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {view === "calendar" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto grid max-w-[1400px] gap-6 p-6 xl:grid-cols-[1fr_380px]">
              <div>
                <section className={`${styles.glossCard} mb-4 p-6`}>
                  <div className={styles.gloss} />
                  <div className="relative z-10 mb-5 flex items-center justify-between">
                    <h2 className={`${styles.mono} text-lg font-bold text-zinc-200`}>
                      {new Date(calendarYear, calendarMonth).toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => navMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-zinc-800/60 text-sm text-zinc-500 transition hover:border-teal-500/30 hover:text-teal-400">
                        ‹
                      </button>
                      <button type="button" onClick={() => navMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-zinc-800/60 text-sm text-zinc-500 transition hover:border-teal-500/30 hover:text-teal-400">
                        ›
                      </button>
                    </div>
                  </div>
                  <div className="relative z-10 mb-2 grid grid-cols-7 gap-1">
                    {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
                      <div key={day} className={`${styles.mono} py-1 text-center text-[9px] text-zinc-600`}>
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="relative z-10 grid grid-cols-7 gap-1">{calendarCells}</div>
                  <div className="relative z-10 mt-4 flex justify-center gap-4">
                    <div className="flex items-center gap-1.5 text-[9px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />OPS</div>
                    <div className="flex items-center gap-1.5 text-[9px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" />CASE</div>
                    <div className="flex items-center gap-1.5 text-[9px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />INTEL</div>
                  </div>
                </section>

                <section className={`${styles.glossCard} p-5`}>
                  <div className={styles.gloss} />
                  <div className="relative z-10 mb-4 flex items-center justify-between">
                    <div>
                      <div className={`${styles.mono} text-[9px] uppercase tracking-widest text-zinc-600`}>
                        {formatDayLabel(selectedDate)}
                      </div>
                      <div className="text-sm font-bold text-zinc-200">Events</div>
                    </div>
                    <span className={`${styles.mono} rounded border border-teal-500/15 bg-teal-500/8 px-2.5 py-1 text-[9px] text-teal-400`}>
                      {selectedEvents.length}
                    </span>
                  </div>
                  <div className="relative z-10 space-y-2">
                    {selectedEvents.length === 0 ? (
                      <div className={`${styles.mono} py-6 text-center text-xs text-zinc-700`}>
                        NO_EVENTS_SCHEDULED
                      </div>
                    ) : (
                      selectedEvents.map((event) => (
                        <div key={event.id} className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-teal-500/20">
                          <div className="h-8 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: eventColor(event.type) }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-zinc-200">{event.t}</div>
                            <div className={`${styles.mono} text-[9px] text-zinc-600`}>
                              {event.time} · {event.dur}min · {event.who}
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => downloadIcs(event.t, event.dur, event.who)}
                              className={`${styles.mono} flex h-7 w-7 items-center justify-center rounded-md border border-white/8 bg-zinc-800 text-[9px] text-zinc-500 transition hover:border-teal-500/30 hover:text-teal-400`}
                              title=".ics"
                            >
                              ↓
                            </button>
                            <a
                              href={buildGoogleCalendarUrl(event.t, event.who)}
                              target="_blank"
                              rel="noreferrer"
                              className={`${styles.mono} flex h-7 w-7 items-center justify-center rounded-md border border-white/8 bg-zinc-800 text-[9px] text-zinc-500 transition hover:border-cyan-500/30 hover:text-cyan-400`}
                              title="Google Calendar"
                            >
                              G
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div>
                <section className={`${styles.glossCard} mb-4 p-5`}>
                  <div className={styles.gloss} />
                  <div className="relative z-10">
                    <div className={`${styles.mono} mb-1 text-[9px] uppercase tracking-widest text-zinc-600`}>Upcoming</div>
                    <div className="mb-4 text-sm font-bold text-zinc-200">Surgical &amp; Fitting Cases</div>
                    <div className={`${styles.timelineRail} space-y-3`}>
                      {surgicalCases.map((patient) => (
                        <button
                          key={patient.id}
                          type="button"
                          onClick={() => setPatientModalId(patient.id)}
                          className="group relative block w-full pl-4 text-left"
                        >
                          <span className="absolute left-[-5px] top-2 h-2.5 w-2.5 rounded-full border-2 border-zinc-900 bg-teal-500" />
                          <div className={`${styles.mono} text-[9px] text-zinc-600`}>{patient.surg}</div>
                          <div className="text-xs font-semibold text-zinc-300 transition group-hover:text-teal-400">{patient.name}</div>
                          <div className="text-[10px] text-zinc-600">
                            {patient.product} · {patient.doc}
                          </div>
                          <div className="mt-1 flex gap-1">
                            <span
                              onClick={(event) => {
                                event.stopPropagation()
                                downloadIcs(`${patient.product} - ${patient.name}`, 60, patient.doc)
                              }}
                              className={`${styles.mono} rounded border border-white/5 bg-zinc-800 px-2 py-0.5 text-[8px] text-zinc-600 transition hover:border-teal-500/20 hover:text-teal-400`}
                            >
                              ↓ .ics
                            </span>
                            <a
                              href={buildGoogleCalendarUrl(`${patient.product} - ${patient.name}`, patient.doc)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className={`${styles.mono} rounded border border-white/5 bg-zinc-800 px-2 py-0.5 text-[8px] text-zinc-600 transition hover:border-cyan-500/20 hover:text-cyan-400`}
                            >
                              GCal ↗
                            </a>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className={`${styles.glossCard} p-5`}>
                  <div className={styles.gloss} />
                  <div className="relative z-10">
                    <div className="mb-3 text-sm font-bold text-zinc-200">Quick Create</div>
                    <div className="space-y-2.5">
                      <label className="block">
                        <div className={`${styles.mono} mb-1 text-[8px] uppercase tracking-widest text-zinc-600`}>Title</div>
                        <input
                          value={quickTitle}
                          onChange={(event) => setQuickTitle(event.target.value)}
                          className="w-full rounded-lg border border-white/5 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-teal-500/30"
                          placeholder="Auth follow-up call"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <div className={`${styles.mono} mb-1 text-[8px] uppercase tracking-widest text-zinc-600`}>Date</div>
                          <input
                            type="date"
                            value={quickDate}
                            onChange={(event) => setQuickDate(event.target.value)}
                            className="w-full rounded-lg border border-white/5 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-teal-500/30"
                          />
                        </label>
                        <label className="block">
                          <div className={`${styles.mono} mb-1 text-[8px] uppercase tracking-widest text-zinc-600`}>Time</div>
                          <input
                            type="time"
                            value={quickTime}
                            onChange={(event) => setQuickTime(event.target.value)}
                            className="w-full rounded-lg border border-white/5 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-teal-500/30"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={createQuickEvent}
                        className={`${styles.mono} w-full rounded-lg bg-gradient-to-r from-teal-500 to-cyan-400 py-2.5 text-xs font-bold uppercase tracking-wider text-black transition hover:shadow-lg hover:shadow-teal-500/20`}
                      >
                        CREATE_EVENT
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}

        {view === "analytics" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1400px] p-6">
              <div className={`${styles.metricGrid} mb-6 grid gap-3`}>
                {[
                  { value: `$${(totalAmount / 1000).toFixed(1)}K`, label: "PIPELINE_VALUE", detail: `${patients.length} orders`, color: "#fff" },
                  { value: "100%", label: "CLEAN_CLAIM", detail: "0 denied MTD", color: "#4ade80" },
                  { value: `${avgTri}%`, label: "TRIDENT_AVG", detail: "312 scored", color: "#2dd4bf" },
                  { value: `${deniedCount}`, label: "DENIALS", detail: `${((deniedCount / patients.length) * 100).toFixed(0)}% rate`, color: "#f87171" },
                  { value: `${paidCount}`, label: "PAID", detail: `$${patients.filter((patient) => patient.stage === "paid").reduce((sum, patient) => sum + patient.amt, 0).toLocaleString()}`, color: "#4ade80" },
                ].map((metric) => (
                  <section key={metric.label} className={`${styles.glossCard} p-5 text-center`}>
                    <div className={styles.gloss} />
                    <div className={`${styles.mono} relative z-10 text-2xl font-bold`} style={{ color: metric.color }}>
                      {metric.value}
                    </div>
                    <div className={`${styles.mono} relative z-10 mt-2 text-[8px] tracking-widest text-zinc-600`}>
                      {metric.label}
                    </div>
                    <div className={`${styles.mono} relative z-10 mt-1 text-[9px] text-zinc-500`}>
                      {metric.detail}
                    </div>
                  </section>
                ))}
              </div>

              <div className={`${styles.chartGrid} mb-4 grid gap-4`}>
                <section className={`${styles.glossCard} p-5`}>
                  <div className={styles.gloss} />
                  <div className="relative z-10">
                    <div className={`${styles.mono} mb-1 text-[9px] uppercase tracking-widest text-zinc-600`}>Billing</div>
                    <div className="mb-4 text-sm font-bold text-zinc-200">Payer Exposure</div>
                    <div className="space-y-3">
                      {payerExposure.map((payer) => (
                        <div key={payer.payer} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-zinc-200">{payer.payer}</div>
                              <div className={`${styles.mono} mt-1 text-[9px] text-zinc-600`}>
                                Pending ${payer.pending.toLocaleString()} · Denied ${payer.denied.toLocaleString()}
                              </div>
                            </div>
                            <div className={`${styles.mono} text-xs font-bold text-zinc-200`}>
                              ${payer.total.toLocaleString()}
                            </div>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400"
                              style={{
                                width: `${Math.max(10, Math.min(100, (payer.pending / Math.max(payer.total, 1)) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className={`${styles.glossCard} p-5`}>
                  <div className={styles.gloss} />
                  <div className="relative z-10">
                    <div className={`${styles.mono} mb-1 text-[9px] uppercase tracking-widest text-zinc-600`}>Intelligence</div>
                    <div className="mb-4 text-sm font-bold text-zinc-200">Denial Rate by Payer · 90d</div>
                    <div className="flex h-36 items-end gap-2">
                      {[
                        { name: "MDCR", rate: 12, color: "#2dd4bf" },
                        { name: "UHC", rate: 8, color: "#4ade80" },
                        { name: "Aetna", rate: 22, color: "#fbbf24" },
                        { name: "BCBS", rate: 15, color: "#a78bfa" },
                        { name: "Cigna", rate: 18, color: "#fb923c" },
                        { name: "Humana", rate: 6, color: "#38bdf8" },
                        { name: "Molina", rate: 31, color: "#f87171" },
                      ].map((payer) => (
                        <div key={payer.name} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                          <span className={`${styles.mono} text-[9px] text-zinc-500`}>{payer.rate}%</span>
                          <span className="w-full rounded-t-md" style={{ height: `${payer.rate * 2.5}%`, backgroundColor: payer.color, opacity: 0.8, minHeight: 3 }} />
                          <span className={`${styles.mono} text-[7px] text-zinc-600`}>{payer.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className={`${styles.glossCard} p-5`}>
                  <div className={styles.gloss} />
                  <div className="relative z-10">
                    <div className={`${styles.mono} mb-1 text-[9px] uppercase tracking-widest text-zinc-600`}>Projection</div>
                    <div className="mb-4 text-sm font-bold text-zinc-200">Cash Flow 90d</div>
                    {[
                      ["30-Day", "$96,400", "#4ade80"],
                      ["60-Day", "$168,200", "#2dd4bf"],
                      ["90-Day", "$212,800", "#38bdf8"],
                      ["At-Risk", "$18,400", "#f87171"],
                      ["Write-off", "$4,200", "#52525b"],
                    ].map(([label, value, color]) => (
                      <div key={label} className="flex justify-between border-b border-white/3 py-2">
                        <span className="text-xs text-zinc-500">{label}</span>
                        <span className={`${styles.mono} text-xs font-bold`} style={{ color }}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className={`${styles.glossCard} overflow-hidden`}>
                <div className="border-b border-white/5 p-4">
                  <div className={styles.gloss} />
                  <div className={`${styles.mono} relative z-10 text-[9px] uppercase tracking-widest text-zinc-600`}>Portfolio</div>
                  <div className="relative z-10 text-sm font-bold text-zinc-200">Company Performance</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="relative z-10 w-full min-w-[720px]">
                    <thead>
                      <tr>
                        {["ENTITY", "VERTICAL", "CLAIMS", "REVENUE", "DENY%", "AR", "CLEAN"].map((header) => (
                          <th key={header} className={`${styles.mono} border-b border-white/5 bg-white/[0.01] px-4 py-3 text-left text-[8px] tracking-widest text-zinc-600`}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Precision Medical", "DME", "412", "$142.8K", "11.3%", "19d", "94%", "#4ade80"],
                        ["LVCO Medical", "Biologics", "298", "$98.4K", "16.8%", "24d", "89%", "#fbbf24"],
                        ["Momentum", "Mobility", "137", "$42.8K", "18.2%", "28d", "87%", "#fbbf24"],
                      ].map(([name, vertical, claims, revenue, deny, ar, clean, color]) => (
                        <tr key={name} className="transition hover:bg-white/[0.02]">
                          <td className="border-b border-white/3 px-4 py-3 text-xs font-bold text-zinc-200">{name}</td>
                          <td className="border-b border-white/3 px-4 py-3 text-[11px] text-zinc-500">{vertical}</td>
                          <td className={`${styles.mono} border-b border-white/3 px-4 py-3 text-[11px] text-zinc-400`}>{claims}</td>
                          <td className={`${styles.mono} border-b border-white/3 px-4 py-3 text-[11px] font-bold text-zinc-300`}>{revenue}</td>
                          <td className={`${styles.mono} border-b border-white/3 px-4 py-3 text-[11px] font-bold`} style={{ color }}>{deny}</td>
                          <td className={`${styles.mono} border-b border-white/3 px-4 py-3 text-[11px] text-zinc-500`}>{ar}</td>
                          <td className={`${styles.mono} border-b border-white/3 px-4 py-3 text-[11px] font-bold`} style={{ color }}>{clean}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {view === "roster" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1400px] p-6">
              <section className={`${styles.glossCard} overflow-hidden`}>
                <div className="border-b border-white/5 p-4">
                  <div className={`${styles.mono} text-[9px] uppercase tracking-widest text-zinc-600`}>Registry</div>
                  <div className="text-sm font-bold text-zinc-200">All Patients · {patients.length} Records</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px]">
                    <thead>
                      <tr>
                        {["PATIENT", "MRN", "HCPCS", "DX", "PAYER", "PRODUCT", "STAGE", "TRI", "AR", "AMT", "ORG"].map((header) => (
                          <th key={header} className={`${styles.mono} border-b border-white/5 bg-white/[0.01] px-3 py-2.5 text-left text-[8px] tracking-widest text-zinc-600`}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {patients.map((patient) => {
                        const stage = STAGE_MAP[patient.stage]
                        const tri = triColor(patient.tri)

                        return (
                          <tr key={patient.id} className="cursor-pointer transition hover:bg-white/[0.02]" onClick={() => setPatientModalId(patient.id)}>
                            <td className="border-b border-white/3 px-3 py-2.5 text-xs font-semibold text-zinc-200">{patient.name}</td>
                            <td className={`${styles.mono} border-b border-white/3 px-3 py-2.5 text-[10px] text-zinc-600`}>{patient.mrn}</td>
                            <td className={`${styles.mono} border-b border-white/3 px-3 py-2.5 text-[10px] text-zinc-400`}>{patient.hcpcs}</td>
                            <td className={`${styles.mono} border-b border-white/3 px-3 py-2.5 text-[10px] text-zinc-600`}>{patient.dx}</td>
                            <td className="border-b border-white/3 px-3 py-2.5 text-[11px] text-zinc-500">{patient.payer}</td>
                            <td className="border-b border-white/3 px-3 py-2.5 text-[11px] text-zinc-500">{patient.product}</td>
                            <td className="border-b border-white/3 px-3 py-2.5">
                              <span
                                className={`${styles.mono} rounded border px-2 py-0.5 text-[8px]`}
                                style={{ backgroundColor: `${stage.c}10`, color: stage.c, borderColor: `${stage.c}25` }}
                              >
                                {stage.l.split("_").pop()}
                              </span>
                            </td>
                            <td className={`${styles.mono} border-b border-white/3 px-3 py-2.5 text-[10px] font-bold`} style={{ color: tri }}>
                              {patient.tri}
                            </td>
                            <td className={`${styles.mono} border-b border-white/3 px-3 py-2.5 text-[10px] text-zinc-600`}>{patient.ar}d</td>
                            <td className={`${styles.mono} border-b border-white/3 px-3 py-2.5 text-[10px] font-bold text-zinc-300`}>${patient.amt.toLocaleString()}</td>
                            <td className={`${styles.mono} border-b border-white/3 px-3 py-2.5 text-[8px] text-zinc-600`}>{patient.org}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </main>

      {patientModal ? (
        <div
          className={`${styles.modalOverlay} fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4`}
          onClick={() => setPatientModalId(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/8 bg-zinc-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-white/8 p-6">
              <div>
                <div className="text-xl font-bold text-zinc-100">{patientModal.name}</div>
                <div className={`${styles.mono} mt-1 text-[11px] text-zinc-600`}>
                  {patientModal.id} · {patientModal.mrn} · DOB {patientModal.dob}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`${styles.mono} rounded-md px-3 py-1 text-[9px]`}
                  style={{
                    backgroundColor: `${STAGE_MAP[patientModal.stage].c}10`,
                    color: STAGE_MAP[patientModal.stage].c,
                    border: `1px solid ${STAGE_MAP[patientModal.stage].c}30`,
                  }}
                >
                  {STAGE_MAP[patientModal.stage].l}
                </span>
                <span
                  className={`${styles.mono} flex h-11 w-11 items-center justify-center rounded-xl border-2 text-lg font-bold`}
                  style={{
                    backgroundColor: `${triColor(patientModal.tri)}12`,
                    color: triColor(patientModal.tri),
                    borderColor: `${triColor(patientModal.tri)}30`,
                  }}
                >
                  {patientModal.tri}
                </span>
                <button
                  type="button"
                  onClick={() => setPatientModalId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-zinc-800 text-sm text-zinc-500 transition hover:text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className={`${styles.mono} mb-3 text-[8px] uppercase tracking-widest text-zinc-600`}>Insurance</div>
                  {[
                    ["Payer", patientModal.payer],
                    ["Member", patientModal.mid],
                    ["HCPCS", patientModal.hcpcs],
                    ["ICD-10", patientModal.dx],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-white/3 py-1.5">
                      <span className="text-[11px] text-zinc-500">{label}</span>
                      <span className={`${styles.mono} text-[11px] font-medium text-zinc-300`}>{value}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className={`${styles.mono} mb-3 text-[8px] uppercase tracking-widest text-zinc-600`}>Order</div>
                  {[
                    ["Product", patientModal.product],
                    ["Physician", patientModal.doc],
                    ["NPI", patientModal.npi],
                    ["Amount", `$${patientModal.amt.toLocaleString()}`],
                    ["Days AR", `${patientModal.ar}d`],
                    ["Portfolio", patientModal.org],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-white/3 py-1.5">
                      <span className="text-[11px] text-zinc-500">{label}</span>
                      <span className={`${styles.mono} text-[11px] font-medium text-zinc-300`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className={`${styles.mono} mb-3 text-[8px] uppercase tracking-widest text-zinc-600`}>
                  Chart Audit · {Object.values(patientModal.checks).filter(Boolean).length}/4 Complete
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  {Object.entries(patientModal.checks).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-sm ${value ? "bg-teal-500" : "border border-white/10 bg-zinc-800"}`} />
                      <span className={`text-[10px] ${value ? "text-zinc-300" : "text-zinc-600"}`}>{key.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {patientModal.surg ? (
                <div className="rounded-xl border p-4" style={{ background: "rgba(139,92,246,0.04)", borderColor: "rgba(139,92,246,0.15)" }}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className={`${styles.mono} text-[8px] uppercase tracking-widest text-violet-300`}>Scheduled Procedure</div>
                      <div className="mt-1 text-sm font-bold text-zinc-200">{patientModal.product}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {formatDayLabel(patientModal.surg)} · {patientModal.doc}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => downloadIcs(`${patientModal.product} - ${patientModal.name}`, 60, patientModal.doc)}
                        className={`${styles.mono} rounded-lg border border-white/8 bg-zinc-800 px-3 py-2 text-[9px] text-zinc-400 transition hover:border-teal-500/20 hover:text-teal-400`}
                      >
                        ↓ .ics
                      </button>
                      <a
                        href={buildGoogleCalendarUrl(`${patientModal.product} - ${patientModal.name}`, patientModal.doc)}
                        target="_blank"
                        rel="noreferrer"
                        className={`${styles.mono} rounded-lg border border-violet-500/30 bg-violet-500/20 px-3 py-2 text-[9px] font-bold text-violet-300 transition hover:bg-violet-500 hover:text-black`}
                      >
                        GCal ↗
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setDocModal({ title: "SWO", patient: patientModal.name })}
                  className={`${styles.mono} rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 py-3 text-xs font-bold uppercase tracking-wider text-black transition hover:shadow-lg hover:shadow-teal-500/20`}
                >
                  VIEW_SWO
                </button>
                <button type="button" className={`${styles.mono} rounded-xl border border-white/8 bg-zinc-800 py-3 text-xs uppercase tracking-wider text-zinc-400 transition hover:border-teal-500/30 hover:text-teal-400`}>
                  ELIGIBILITY
                </button>
                <button type="button" className={`${styles.mono} rounded-xl border border-white/8 bg-zinc-800 py-3 text-xs uppercase tracking-wider text-zinc-400 transition hover:border-teal-500/30 hover:text-teal-400`}>
                  CMS-1500
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {docModal ? (
        <div
          className={`${styles.modalOverlay} fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4`}
          onClick={() => setDocModal(null)}
        >
          <div
            className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/8 p-5">
              <h2 className={`${styles.mono} text-sm font-bold text-teal-400`}>
                VIEWING_{docModal.title}_{docModal.patient.replace(/\s/g, "_").toUpperCase()}.PDF
              </h2>
              <button type="button" onClick={() => setDocModal(null)} className={`${styles.mono} text-xs text-zinc-500 transition hover:text-white`}>
                CLOSE [ESC]
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 text-zinc-700">
              <div className="mb-4 flex h-28 w-20 items-center justify-center rounded-lg border-2 border-dashed border-zinc-800 text-2xl font-serif italic text-zinc-700">
                PDF
              </div>
              <p className={`${styles.mono} text-[10px] uppercase tracking-widest text-zinc-600`}>
                Rendering encrypted document stream...
              </p>
              <div className="mt-5 h-1 w-48 overflow-hidden rounded-full bg-zinc-900">
                <div className="h-full w-1/3 animate-pulse bg-teal-500" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
