import PoseidonOsDashboardEditorial from "@/components/spear/poseidon_os_dashboard_editorial"
import type { SpearBoardCase } from "@/lib/spear-board"

export function OperationalBoard({ initialCases }: { initialCases: SpearBoardCase[] }) {
  return <PoseidonOsDashboardEditorial initialCases={initialCases} />
}
