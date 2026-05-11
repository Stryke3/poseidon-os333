"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Command,
  FileText,
  Database,
  Brain,
  Zap,
  DollarSign,
  Puzzle,
  Settings,
  Activity,
  LogOut
} from "lucide-react"

const T = {
  bg: "#05070B",
  bgSoft: "#080D14", 
  panel: "#0B1220",
  panelSoft: "#111827",
  panelLift: "#151E2E",
  border: "#243044",
  borderSoft: "#1A2433",
  ivory: "#F7F2E8",
  white: "#FFFFFF",
  muted: "#A7B0C0",
  mutedSoft: "#6B7280",
  gold: "#B89B5E",
  goldSoft: "#D7C28A",
  blue: "#132238",
  blueBright: "#1E3A5F",
  danger: "#B91C1C",
  warning: "#C08403",
  success: "#15803D",
}

const NAV_ITEMS = [
  { key: "command", label: "Command", href: "/spear", icon: Command },
  { key: "intake", label: "Intake", href: "/spear/intake", icon: FileText },
  { key: "cases", label: "Cases", href: "/spear/cases", icon: Activity },
  { key: "poseidon", label: "Poseidon", href: "/spear/poseidon", icon: Database },
  { key: "trident", label: "Trident", href: "/spear/trident", icon: Brain },
  { key: "fulfillment", label: "Fulfillment", href: "/spear/fulfillment", icon: Zap },
  { key: "revenue-support", label: "Revenue Support", href: "/spear/revenue-support", icon: DollarSign },
  { key: "integrations", label: "Integrations", href: "/spear/integrations", icon: Puzzle },
  { key: "settings", label: "Settings", href: "/spear/settings", icon: Settings },
]

export function SpearNavigation() {
  const pathname = usePathname()

  return (
    <nav style={{
      background: T.panel,
      border: `1px solid ${T.border}`,
      borderRadius: "8px",
      padding: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      minWidth: "200px",
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${T.borderSoft}`,
        marginBottom: "8px",
      }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "20px",
          fontWeight: 700,
          color: T.ivory,
          margin: 0,
          letterSpacing: "-0.01em",
        }}>
          SPEAR
        </h1>
        <p style={{
          fontSize: "10px",
          color: T.muted,
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          Compliance-Driven Execution
        </p>
      </div>

      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href || (item.key !== "command" && pathname.startsWith(item.href))
        
        return (
          <Link
            key={item.key}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 16px",
              borderRadius: "6px",
              color: isActive ? T.ivory : T.muted,
              background: isActive ? `${T.gold}20` : "transparent",
              border: isActive ? `1px solid ${T.gold}40` : "1px solid transparent",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: isActive ? 500 : 400,
              transition: "all 160ms ease",
            }}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        )
      })}

      <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: `1px solid ${T.borderSoft}` }}>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 16px",
            borderRadius: "6px",
            color: T.muted,
            background: "transparent",
            border: "1px solid transparent",
            fontSize: "13px",
            fontWeight: 400,
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </nav>
  )
}
