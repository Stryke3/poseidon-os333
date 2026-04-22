import MinimalSidebar from "@/components/exec/MinimalSidebar"

export default function ExecLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <MinimalSidebar />
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  )
}
