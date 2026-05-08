import { FormEvent, useState } from "react";

const PASSWORD = "candor2026";

function GanttChart() {
  const rows = [
    { label: "DISCOVERY", start: 14, width: 34 },
    { label: "VENUE", start: 26, width: 48 },
    { label: "MOTION", start: 8, width: 62 },
    { label: "FILING", start: 44, width: 38 },
  ];

  return (
    <section className="intel-panel h-full">
      <PanelHeader title="LITIGATION TIMELINE" code="LT-09" />
      <svg viewBox="0 0 420 210" className="h-full min-h-[190px] w-full" aria-hidden="true">
        <defs>
          <linearGradient id="amberLine" x1="0" x2="1">
            <stop offset="0" stopColor="#fff7d6" />
            <stop offset="0.45" stopColor="#ff9a24" />
            <stop offset="1" stopColor="#ff4a00" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4, 5].map((line) => (
          <line
            key={line}
            x1={62 + line * 58}
            y1="24"
            x2={62 + line * 58}
            y2="184"
            stroke="rgba(255,255,255,.12)"
            strokeDasharray="4 8"
          />
        ))}
        {rows.map((row, index) => (
          <g key={row.label}>
            <text x="18" y={55 + index * 34} className="svg-mono muted">
              {row.label}
            </text>
            <rect x="118" y={39 + index * 34} width="248" height="16" fill="rgba(255,255,255,.045)" />
            <rect
              x={118 + row.start}
              y={39 + index * 34}
              width={row.width * 2.2}
              height="16"
              fill="url(#amberLine)"
              opacity=".92"
            />
            <circle cx={118 + row.start + row.width * 2.2} cy={47 + index * 34} r="4" fill="#fff7cf" />
          </g>
        ))}
        <path d="M20 192H400M20 22H400" stroke="rgba(255,128,22,.4)" strokeWidth="1" />
      </svg>
    </section>
  );
}

function BarChart() {
  const values = [38, 74, 48, 92, 57, 81, 66];

  return (
    <section className="intel-panel h-full">
      <PanelHeader title="LITIGATION TIMELINE" code="BURNDOWN" />
      <svg viewBox="0 0 420 210" className="h-full min-h-[190px] w-full" aria-hidden="true">
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1="28" y1={52 + line * 34} x2="392" y2={52 + line * 34} stroke="rgba(255,255,255,.1)" />
        ))}
        <polyline
          points="32,160 82,118 134,130 184,78 238,104 292,56 354,88 390,42"
          fill="none"
          stroke="#ff6818"
          strokeWidth="2"
          opacity=".72"
        />
        {values.map((value, index) => (
          <g key={`${value}-${index}`}>
            <rect x={50 + index * 48} y={174 - value * 1.32} width="22" height={value * 1.32} fill="#f97316" opacity=".9" />
            <rect x={78 + index * 48} y={184 - value} width="12" height={value} fill="#fff1d0" opacity=".42" />
          </g>
        ))}
        <text x="30" y="196" className="svg-mono muted">
          CADENCE / PLEADING / ADVERSARY SIGNALS
        </text>
      </svg>
    </section>
  );
}

function Blueprint() {
  return (
    <section className="intel-panel h-full">
      <PanelHeader title="ARCHITECT SCHEMATIC" code="AX-44" />
      <svg viewBox="0 0 420 210" className="h-full min-h-[190px] w-full" aria-hidden="true">
        <g stroke="rgba(255,255,255,.18)" fill="none">
          <path d="M40 40H380V168H40Z" />
          <path d="M88 72H186V136H88ZM224 58H344V102H224ZM236 124H326V160H236Z" />
          <path d="M186 104H224M326 142H380M40 104H88" strokeDasharray="8 6" />
          <circle cx="137" cy="104" r="22" />
          <circle cx="284" cy="80" r="14" />
        </g>
        <g stroke="#ff7a1a" strokeWidth="2" fill="none">
          <path d="M64 32V18H142M356 178V194H270" />
          <path d="M196 174l28-42 34 22 46-76" />
        </g>
        <text x="52" y="190" className="svg-mono muted">
          PRESSURE LOCK / JURISDICTION ROUTE / VAULT SEAL
        </text>
      </svg>
    </section>
  );
}

function FinancialTables() {
  const rows = [
    ["Q1", "$2.4M", "+18.7%"],
    ["Q2", "$4.1M", "+31.2%"],
    ["Q3", "$6.8M", "+46.0%"],
    ["Q4", "$9.9M", "+63.4%"],
  ];

  return (
    <section className="intel-panel h-full">
      <PanelHeader title="CASH-FLOW MODELS" code="LITIGATION GAINS" />
      <div className="grid h-full content-center gap-3 px-1 py-5 font-mono text-[11px] text-white/76 sm:text-xs">
        <div className="grid grid-cols-3 border-y border-white/15 py-2 text-white">
          <span>WINDOW</span>
          <span>RECOVERY</span>
          <span>GAIN</span>
        </div>
        {rows.map((row) => (
          <div key={row[0]} className="grid grid-cols-3 border-b border-white/10 py-2">
            <span>{row[0]}</span>
            <span className="text-orange-200">{row[1]}</span>
            <span className="text-orange-400">{row[2]}</span>
          </div>
        ))}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-4 border border-orange-500/50 bg-orange-500/10 p-3 text-orange-100 shadow-amber">
          <span>LITIGATION GAINS</span>
          <span>LOCKED</span>
        </div>
      </div>
    </section>
  );
}

function PanelHeader({ title, code }: { title: string; code: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2 font-mono text-[10px] uppercase tracking-[.2em] text-white/70">
      <span>{title}</span>
      <span className="text-orange-300">{code}</span>
    </div>
  );
}

function VaultMechanism({ unlocked }: { unlocked: boolean }) {
  return (
    <div className={`vault-core ${unlocked ? "vault-unlocked" : ""}`} aria-label="Jurisdiction lock mechanism">
      <div className="vault-rail vault-rail-top" />
      <div className="vault-rail vault-rail-bottom" />
      <div className="vault-clamp vault-clamp-left" />
      <div className="vault-clamp vault-clamp-right" />
      <div className="vault-bolt vault-bolt-left-top" />
      <div className="vault-bolt vault-bolt-right-top" />
      <div className="vault-bolt vault-bolt-left-bottom" />
      <div className="vault-bolt vault-bolt-right-bottom" />
      <div className="vault-dial">
        <div className="vault-dial-inner" />
      </div>
      <div className="vault-window">
        <div className="scanline" />
        <span>{unlocked ? "VAULT UNLOCKED" : "VERIFY JURISDICTION INK"}</span>
      </div>
    </div>
  );
}

export function LockedVaultLanding() {
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.trim() === PASSWORD) {
      setUnlocked(true);
      return;
    }

    setInput("");
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
  }

  return (
    <main className={`vault-page ${flash ? "flash-denied" : ""}`}>
      <div className="vertical-stream left-4 top-8">LITIGATION CADENCE ACTIVE, PLATFORM DENSITY SECURE, CORRIDOR STRATEGY ENGINEERED.</div>
      <div className="vertical-stream right-4 bottom-8">LITIGATION CADENCE ACTIVE, PLATFORM DENSITY SECURE, CORRIDOR STRATEGY ENGINEERED.</div>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-7 py-8 sm:px-12 lg:px-16">
        <header className="mx-auto max-w-6xl text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[.44em] text-orange-300/90">EGEIRO_VAULT / INDUSTRIAL INTELLIGENCE</p>
          <h1 className="font-display text-[clamp(3.2rem,8vw,8.9rem)] font-extrabold uppercase leading-[.78] tracking-normal text-white">
            CANDOR THROUGH FIRE
          </h1>
          <p className="mt-5 font-mono text-sm uppercase tracking-[.3em] text-white md:text-lg">A NAME INHERITED. A MAN DELIVERED.</p>
        </header>

        <div className="mt-10 grid flex-1 items-center gap-5 lg:grid-cols-[minmax(240px,1fr)_minmax(380px,1.34fr)_minmax(240px,1fr)]">
          <div className="grid gap-5">
            <GanttChart />
            <BarChart />
          </div>

          <section className="center-stage">
            <VaultMechanism unlocked={unlocked} />
            <form onSubmit={submitAccess} className="mt-7 w-full">
              <label className="sr-only" htmlFor="vault-code">
                Access code
              </label>
              <div className="command-shell">
                <span className="text-orange-400">root@candor:</span>
                <input
                  id="vault-code"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase tracking-[.16em] text-white outline-none placeholder:text-white/42"
                  placeholder="ACCESS CODE REQUIRED. [INPUT HASH] -> -> ->"
                  type="text"
                  autoComplete="off"
                />
              </div>
              <div className="mt-4 h-6 text-center font-mono text-[11px] uppercase tracking-[.26em] text-orange-200/80">
                {unlocked ? "ACCESS GRANTED - ROUTING TO EGEIRO_VAULT" : "HASH SEAL AWAITING OPERATOR"}
              </div>
            </form>
          </section>

          <div className="grid gap-5">
            <Blueprint />
            <FinancialTables />
          </div>
        </div>
      </section>
    </main>
  );
}
