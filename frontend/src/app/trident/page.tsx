import { OperationalBoard } from "@/components/spear/OperationalBoard"
import { getSpearBoardCases } from "@/app/trident/_lib/getSpearBoardCases"

export const dynamic = "force-dynamic"

export default async function TridentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const cases = await getSpearBoardCases(q)

  return <OperationalBoard initialCases={cases} />
}
