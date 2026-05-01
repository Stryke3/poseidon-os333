import { getTridentCaseDetail, listTridentCases } from "@/lib/trident-engine"
import { toSpearBoardCase } from "@/lib/spear-board"

export async function getSpearBoardCases(query?: string) {
  const summaries = await listTridentCases(query)
  const details = await Promise.all(summaries.map((summary) => getTridentCaseDetail(summary.id)))
  return details.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail)).map(toSpearBoardCase)
}
