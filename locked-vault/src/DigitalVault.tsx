import React, { useState, useEffect } from 'react';

// Main Application Component
export default function DigitalVault() {
  const [isLocked, setIsLocked] = useState(true);
  const [password, setPassword] = useState("");
  const [isError, setIsError] = useState(false);

  // Inject Google Fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Syne:wght@700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  // Handle Login Logic
  const handleLogin = (e) => {
    if (e.key === 'Enter') {
      if (password.toLowerCase() === "candor2026") {
        setIsLocked(false);
      } else {
        setIsError(true);
        setPassword("");
        setTimeout(() => setIsError(false), 500); // Reset error flash
      }
    }
  };

  // --- VIEW 1: THE VAULT (LOCKED) ---
  if (isLocked) {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-300 font-['JetBrains_Mono'] flex flex-col items-center justify-center p-4 selection:bg-amber-500 selection:text-black">
        {/* Top Header Marquee */}
        <div className="absolute top-0 w-full border-b border-zinc-800 py-2 overflow-hidden bg-black">
          <div className="whitespace-nowrap animate-pulse text-[10px] text-center tracking-[0.2em] text-zinc-500">
            SYSTEMS OVER EMOTION. DOCUMENTATION OVER ARGUMENT. // SYSTEMS OVER EMOTION. DOCUMENTATION OVER ARGUMENT.
          </div>
        </div>

        {/* Main Title */}
        <h1 className="font-['Syne'] text-7xl md:text-9xl font-extrabold text-white mb-12 tracking-tighter uppercase italic">
          THE <span className="text-transparent stroke-zinc-100 bg-clip-text bg-gradient-to-b from-white to-zinc-700 [text-shadow:4px_4px_0px_rgba(245,158,11,0.5)]">DOSSIER</span>
        </h1>

        {/* Center Mechanism */}
        <div className={`w-full max-w-md border-2 p-8 transition-all duration-300 ${isError ? 'border-red-600 animate-shake' : 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)]'}`}>
          <p className="text-amber-500 text-xs mb-4 tracking-widest uppercase">VERIFY CREDENTIAL</p>
          <div className="flex items-center">
            <span className="mr-2 text-amber-500 font-bold tracking-tighter">[INPUT HASH] -{'>'}</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleLogin}
              className="bg-transparent border-none outline-none text-white w-full placeholder-zinc-700"
              placeholder="••••••••"
            />
          </div>
        </div>
        
        <p className="mt-6 text-[10px] text-amber-500/50 tracking-widest uppercase">
          UNAUTHORIZED ACCESS ATTEMPTS LOGGED AND TRACED.
        </p>
      </div>
    );
  }

  // --- VIEW 2: THE EVIDENCE ROOM (UNLOCKED) ---
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-['JetBrains_Mono'] p-6 md:p-12 animate-in fade-in duration-700">
      <header className="mb-12 border-b border-zinc-800 pb-4 flex justify-between items-end">
        <div className="text-amber-500 text-xs tracking-[0.3em] font-bold">
          DECRYPTION COMPLETE. AUTHORIZED ACCESS.
        </div>
        <div className="text-zinc-600 text-[10px]">
          SESSION_ID: {Math.random().toString(16).slice(2, 10).toUpperCase()}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        
        {/* COLUMN 1: ARTIFACTS */}
        <section className="space-y-6">
          <h2 className="font-['Syne'] text-2xl text-white uppercase font-bold border-l-4 border-amber-500 pl-4">01. FORENSIC ARTIFACTS</h2>
          <ul className="space-y-2 text-sm uppercase">
            {['EXECUTED_CONFESSION_OF_JUDGEMENT_2015.pdf', 'EXECUTED_QUITCLAIM_DEED.pdf', 'SHADOW_LEDGER_PnL_2020-2021.csv', 'CPO_12M_LETTER_OF_INTENT.pdf'].map((item) => (
              <li key={item} className="group cursor-pointer flex items-center p-2 border border-transparent hover:border-zinc-800 hover:bg-zinc-900/50 transition-all">
                <span className="w-0 group-hover:w-2 h-4 bg-amber-500 mr-0 group-hover:mr-3 transition-all duration-200"></span>
                <span className="group-hover:text-amber-500">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* COLUMN 2: NARRATIVE */}
        <section className="space-y-6 border-x border-zinc-900 px-0 md:px-8">
          <h2 className="font-['Syne'] text-2xl text-white uppercase font-bold">02. THE DOCTRINE</h2>
          <div className="space-y-4">
            <h3 className="text-amber-500 font-bold italic tracking-tighter">VOL I: COLLATERAL DAMAGE</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">
              A name inherited. A man delivered. The documented account of a high-altitude political operator trapped in a legally engineered medical collapse.
            </p>
            <button 
              onClick={() => window.open('/manuscript.pdf', '_blank')}
              className="w-full bg-white text-black font-bold py-4 px-6 hover:bg-amber-500 transition-colors uppercase text-sm tracking-tighter"
            >
              DOWNLOAD MANUSCRIPT [WATERMARKED PDF]
            </button>
          </div>
        </section>

        {/* COLUMN 3: ARCHITECT */}
        <section className="space-y-8">
          <div>
            <h2 className="font-['Syne'] text-2xl text-white uppercase font-bold mb-6">03. CURRENT STATUS</h2>
            <div className="bg-zinc-900/30 p-4 border border-zinc-800 space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-zinc-600">ENTITY_01:</span> <span>CEO, STRYKEFOX MEDICAL</span></p>
              <p className="flex justify-between"><span className="text-zinc-600">ENTITY_02:</span> <span>EGEIRO HOLDINGS</span></p>
            </div>
          </div>

          <div className="border border-amber-500/30 p-6 text-center">
            <p className="text-xs text-amber-500/50 mb-2 uppercase">Core Logic</p>
            <div className="text-lg text-white font-bold">
              Outcome = Direction × Velocity × Leverage
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-zinc-600 uppercase tracking-widest font-bold">Contact Node</p>
            <div className="text-[11px] space-y-2">
              <p className="flex flex-col">
                <span className="text-zinc-500">LITERARY REPRESENTATION -{'>'}</span>
                <a href="mailto:publishing@adamstryker.com" className="hover:text-amber-500">publishing@adamstryker.com</a>
              </p>
              <p className="flex flex-col">
                <span className="text-zinc-500">STRATEGIC INQUIRIES -{'>'}</span>
                <a href="mailto:office@adamstryker.com" className="hover:text-amber-500">office@adamstryker.com</a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
