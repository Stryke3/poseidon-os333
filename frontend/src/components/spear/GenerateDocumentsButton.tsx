"use client"

export function GenerateDocumentsButton({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-2xl bg-[#d9eb74] px-4 py-3 text-sm font-semibold text-[#14111a] transition hover:bg-[#e4f48e] disabled:cursor-not-allowed disabled:bg-[#2f3225] disabled:text-slate-500"
    >
      Generate SWO + POD
    </button>
  )
}
