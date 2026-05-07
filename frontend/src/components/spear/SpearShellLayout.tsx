"use client"

import React from "react"
import { SpearNavigation } from "./SpearNavigation"

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

interface SpearShellLayoutProps {
  children: React.ReactNode
}

export function SpearShellLayout({ children }: SpearShellLayoutProps) {
  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      display: "flex",
    }}>
      {/* Sidebar Navigation */}
      <div style={{
        width: "240px",
        padding: "24px",
        borderRight: `1px solid ${T.border}`,
        background: T.bgSoft,
      }}>
        <SpearNavigation />
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        overflow: "auto",
      }}>
        {children}
      </div>
    </div>
  )
}
