"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SpearLoginClient() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-sans">
      <div className="w-full max-w-[400px] p-12 border border-zinc-200 rounded-lg shadow-sm">
        <div className="mb-8">
          <div className="font-extrabold text-2xl tracking-tighter text-slate-900">SPEAR</div>
          <div className="text-[10px] tracking-[0.2em] text-cyan-500 uppercase font-bold mt-1">StrykeFox Medical</div>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Operator Sign In</h1>
        <p className="text-sm text-slate-500 mb-8">Execution platform access.</p>
        
        <button 
          onClick={() => router.push('/spear/cases')}
          disabled={loading}
          className="w-full py-4 bg-slate-900 text-white font-bold rounded-md hover:bg-black transition-all"
        >
          ENTER SURGICAL ENGINE
        </button>
      </div>
    </div>
  );
}
