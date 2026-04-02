/** Server-side Next.js route logging (no PHI in messages). */

export function logUnauthorizedAttempt(route: string) {
  console.warn(JSON.stringify({ event: "unauthorized_attempt", route }))
}

export function logChartContainmentFailure(route: string, patientId: string, orderId: string, detail: string) {
  console.warn(
    JSON.stringify({
      event: "containment_check_failed",
      route,
      patient_id: patientId,
      order_id: orderId,
      detail,
    }),
  )
}

export function logChartProxyOk(
  event: "document_download_proxy_ok" | "document_proxy_ok",
  fields: Record<string, string | undefined>,
) {
  console.info(JSON.stringify({ event, ...fields }))
}
