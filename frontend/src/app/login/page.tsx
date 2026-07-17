"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin() {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: "admin@strykefox.com",
        password: "admin",
        redirect: false,
      });
      if (result?.ok) {
        router.push("/spear");
      }
    } catch (error) {
      console.error("Login failed", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FBFF] flex items-center justify-center font-sans px-5">
      <div className="w-full max-w-md p-8 border border-slate-200 bg-white shadow-[0_24px_80px_rgba(11,31,58,0.12)] rounded-xl">
        <div className="flex items-center space-x-4 mb-8">
          <div className="w-12 h-12 bg-white border border-slate-200 text-[#0B1F3A] flex items-center justify-center overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/sfm-logo.jpeg" alt="StrykeFox Medical" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="text-[#0B1F3A] font-bold tracking-wide">StrykeFox Medical</div>
            <div className="text-slate-500 text-xs">Poseidon Dashboard</div>
          </div>
        </div>
        <div className="mb-7">
          <div className="text-[#2563EB] text-xs font-bold uppercase tracking-[0.12em] mb-2">Secure operator access</div>
          <h1 className="text-[#0B1F3A] text-3xl font-bold leading-tight">Sign in to dashboard</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Continue to the authenticated dashboard session.</p>
        </div>
        <button 
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-4 bg-[#0B1F3A] text-white font-bold hover:bg-[#12345E] transition-colors disabled:opacity-50 rounded-lg"
        >
          {loading ? "Signing in..." : "Continue to dashboard"}
        </button>
      </div>
    </div>
  );
}
