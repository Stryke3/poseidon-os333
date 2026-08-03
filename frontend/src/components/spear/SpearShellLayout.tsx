"use client";
import React from "react";
import SpearNavigation from "./SpearNavigation";

type SpearShellLayoutProps = {
  children: React.ReactNode;
  userName?: string;
  userEmail?: string;
};

export function SpearShellLayout({ children }: SpearShellLayoutProps) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8FAFC" }}>
      <div style={{
        width: 224, minWidth: 224, background: "#FFFFFF",
        borderRight: "1px solid #E2E8F0", position: "fixed",
        top: 0, left: 0, height: "100vh", zIndex: 50,
        display: "flex", flexDirection: "column",
      }}>
        <SpearNavigation />
      </div>
      <div style={{ marginLeft: 224, flex: 1, padding: "28px 32px", background: "#F8FAFC", minHeight: "100vh", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

export default SpearShellLayout;
