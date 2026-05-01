import { SpearSidebar } from "@/components/spear/SpearSidebar"
import { SpearTopbar } from "@/components/spear/SpearTopbar"

export function SpearShell({
  children,
  userEmail,
  userRole,
}: {
  children: React.ReactNode
  userEmail: string
  userRole: string
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(217,235,116,0.08),transparent_22%),linear-gradient(180deg,#110f15_0%,#17131b_48%,#120f17_100%)] text-slate-100">
      <div className="flex min-h-screen">
        <SpearSidebar userEmail={userEmail} userRole={userRole} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <SpearTopbar />
          <main className="min-h-0 flex-1 px-5 py-5 lg:px-8 lg:py-7">{children}</main>
        </div>
      </div>
    </div>
  )
}
