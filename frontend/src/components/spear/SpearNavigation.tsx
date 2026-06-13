"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV = [
  { label: "Command",  href: "/spear" },
  { label: "Cases",    href: "/spear/cases" },
  { label: "Intake",   href: "/spear/intake" },
  { label: "Trident",  href: "/spear/trident" },
  { label: "Poseidon", href: "/spear/poseidon" },
  { label: "Conveyor", href: "/spear/conveyor" },
  { label: "Revenue",  href: "/spear/revenue" },
];

export default function SpearNavigation() {
  const path = usePathname();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "24px 0" }}>
      <div style={{ padding: "0 20px 28px", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "#0F172A" }}>
          SPEAR OS
        </div>
      </div>
      <div style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ label, href }) => {
          const active = path === href || (href !== "/spear" && path.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              display: "block", padding: "9px 12px", borderRadius: 7,
              fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? "#0F172A" : "#64748B",
              background: active ? "#F1F5F9" : "transparent",
              textDecoration: "none",
            }}>
              {label}
            </Link>
          );
        })}
      </div>
      <div style={{ padding: "16px 12px", borderTop: "1px solid #F1F5F9" }}>
        <button onClick={() => signOut({ callbackUrl: "/login" })} style={{
          width: "100%", padding: "9px 12px", background: "none",
          border: "none", cursor: "pointer", textAlign: "left",
          fontSize: 13, color: "#94A3B8", borderRadius: 7,
        }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
