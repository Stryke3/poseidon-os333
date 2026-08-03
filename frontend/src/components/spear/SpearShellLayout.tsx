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
        width: 200, minWidth: 200, background: "#FFFFFF",
        borderRight: "1px solid #E2E8F0", position: "fixed",
        top: 0, left: 0, height: "100vh", zIndex: 50,
        display: "flex", flexDirection: "column",
      }}>
        <SpearNavigation />
      </div>
      <div style={{ marginLeft: 200, flex: 1, padding: "40px 48px", background: "#F8FAFC", minHeight: "100vh" }}>
        {children}
      </div>
    </div>
  );
}

export default SpearShellLayout;
