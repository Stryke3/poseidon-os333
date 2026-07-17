import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { SpearMasterDataSettings } from "@/components/spear/SpearMasterDataSettings"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearSettingsPage() {
  const auth = await requireSpearPageAuth("/spear/settings")

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <div style={{ background: "#FFFFFF", minHeight: "100%" }}>
        <div style={{ padding: "24px 32px", borderBottom: "1px solid #E5E7EB" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: 0, marginBottom: "4px" }}>Settings</h1>
          <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>SPEAR workspace configuration</p>
        </div>
        <div style={{ padding: "32px", display: "grid", gap: 20 }}>
          <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "24px", background: "#F9FAFB", maxWidth: "680px" }}>
            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 4px" }}>Signed in as</p>
              <p style={{ fontSize: "14px", color: "#0F172A", fontWeight: 500, margin: 0 }}>{auth.user?.email ?? auth.user?.id ?? "—"}</p>
              <p style={{ fontSize: "13px", color: "#6B7280", margin: "2px 0 0" }}>{auth.mode}</p>
            </div>
            <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: "16px" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", margin: "0 0 4px" }}>Role</p>
              <p style={{ fontSize: "13px", color: "#374151", margin: 0 }}>{auth.user?.role ?? "—"}</p>
            </div>
          </div>
          <SpearMasterDataSettings />
        </div>
      </div>
    </SpearShellLayout>
  )
}
