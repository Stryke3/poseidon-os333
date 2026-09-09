import type { SpearCase } from "@/lib/poseidon-store";
import { getStageLabel, isArchivedCase, isSyntheticCase } from "@/lib/spear-next-action";

export type ForecastMethod = "ADJUDICATED_835" | "PAYER_ALLOWABLE" | "CONTRACTED_RATE" | "HISTORICAL_REALIZATION" | "MANUAL_OVERRIDE" | "UNKNOWN";

export type MobileRevenueItem = {
  caseId: string; claimId: string | null; patient: string; provider: string; payer: string; product: string;
  submittedAmount: number; expectedAllowedAmount: number | null; expectedCollectibleAmount: number | null;
  expectedPaymentDate: string | null; expectedPaymentDateLow: string | null; expectedPaymentDateHigh: string | null;
  forecastConfidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; forecastMethod: ForecastMethod;
  forecastBasis: string; daysOutstanding: number | null; claimStatus: string; nextAction: string; blocker: string;
};

export type MobileAction = {
  id: string; category: string; caseId: string; patient: string; provider: string; payer: string; product: string;
  currentStage: string; revenueAtRisk: number | null; blocker: string; nextAction: string; age: number; priority: number;
  deadline: string | null;
};

export type MobileTrackerStep = { key: string; label: string; status: "complete" | "pending" | "blocked"; detail: string };

const n = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const s = (value: unknown) => String(value || "").trim();
const iso = (value: unknown): string | null => {
  const date = new Date(s(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const daysSince = (value: unknown, now: Date) => {
  const date = iso(value); if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 86_400_000));
};

export function normalizeRevenueItem(record: SpearCase, now = new Date()): MobileRevenueItem {
  const submitted = n(record.submitted_amount ?? record.billed_amount ?? record.charge_amount) ?? 0;
  const adjudicated = n(record.adjudicated_amount ?? record.allowed_amount_835);
  const allowable = n(record.expected_allowed_amount ?? record.payer_allowable);
  const contracted = n(record.contracted_rate);
  const historical = n(record.historical_expected_collectible ?? record.historical_realization_amount);
  const manual = n(record.manual_expected_collectible);
  let expected: number | null = null;
  let method: ForecastMethod = "UNKNOWN";
  let confidence: MobileRevenueItem["forecastConfidence"] = "UNKNOWN";
  let basis = "No supported collectible-revenue basis is stored; billed charges were not used.";
  if (adjudicated !== null) { expected = adjudicated; method = "ADJUDICATED_835"; confidence = "HIGH"; basis = "Adjudicated amount stored from remittance/835 data."; }
  else if (allowable !== null) { expected = allowable; method = "PAYER_ALLOWABLE"; confidence = "HIGH"; basis = "Known payer allowable stored on the revenue item."; }
  else if (contracted !== null) { expected = contracted; method = "CONTRACTED_RATE"; confidence = "MEDIUM"; basis = "Configured contracted rate stored on the revenue item."; }
  else if (historical !== null) { expected = historical; method = "HISTORICAL_REALIZATION"; confidence = "MEDIUM"; basis = "Stored payer/product historical realization estimate."; }
  else if (manual !== null && record.manual_forecast_approved === true) { expected = manual; method = "MANUAL_OVERRIDE"; confidence = "LOW"; basis = "Approved manual collectible estimate."; }
  else if (record.allow_billed_amount_forecast === true && submitted > 0) { expected = submitted; method = "MANUAL_OVERRIDE"; confidence = "LOW"; basis = "Billed amount explicitly configured as the forecast basis."; }

  const paymentDate = iso(record.expected_payment_date ?? record.remittance_payment_date);
  const low = iso(record.expected_payment_date_low) || paymentDate;
  const high = iso(record.expected_payment_date_high) || paymentDate;
  const submittedAt = record.claim_submitted_at ?? record.submitted_at;
  return {
    caseId: record.id, claimId: s(record.claim_id) || null, patient: record.patient_name, provider: record.provider,
    payer: record.payer, product: record.product, submittedAmount: submitted, expectedAllowedAmount: allowable ?? adjudicated,
    expectedCollectibleAmount: expected, expectedPaymentDate: paymentDate, expectedPaymentDateLow: low,
    expectedPaymentDateHigh: high, forecastConfidence: confidence, forecastMethod: method, forecastBasis: basis,
    daysOutstanding: daysSince(submittedAt, now), claimStatus: s(record.claim_status || record.billing_status || record.status).toUpperCase(),
    nextAction: s(record.next_action) || "Review case", blocker: s(record.blocker || (Array.isArray(record.missing_fields) ? record.missing_fields.join(", ") : "")),
  };
}

export function forecastBucket(dateValue: string | null, now = new Date()) {
  if (!dateValue) return "UNSCHEDULED";
  const days = Math.ceil((new Date(dateValue).getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "TODAY";
  if (days <= 7) return "NEXT_7_DAYS";
  if (days <= 14) return "DAYS_8_14";
  if (days <= 30) return "DAYS_15_30";
  if (days <= 60) return "DAYS_31_60";
  return "DAYS_61_PLUS";
}

function actionCategory(record: SpearCase): string | null {
  const claim = s(record.claim_status).toLowerCase();
  const auth = s(record.authorization_status || record.auth_status).toUpperCase();
  if (record.appeal_status || claim === "appeal") return "APPEAL";
  if (claim === "denied" || record.denial_reason) return "DENIAL";
  if (claim === "rejected") return "CLAIM_REJECTION";
  if (record.unmatched_era === true) return "UNMATCHED_ERA";
  if (record.posting_exception === true) return "POSTING_EXCEPTION";
  if (record.underpayment_amount && Number(record.underpayment_amount) > 0) return "UNDERPAYMENT";
  if (["REQUIRED", "PENDING", "DENIED", "UNKNOWN"].includes(auth)) return "AUTH";
  if (s(record.eligibility_status).toLowerCase() !== "verified") return "VERIFY";
  if (record.status === "ready_to_bill") return "READY_TO_BILL";
  if (record.fax_status === "READY" || record.fax_status === "FAILED") return "FAX";
  return record.missing_fields?.length ? "PAYER_EXCEPTION" : null;
}

export function buildMobileData(records: SpearCase[], now = new Date()) {
  const cases = records.filter((record) => !isArchivedCase(record) && !isSyntheticCase(record));
  const items = cases.map((record) => ({
    ...normalizeRevenueItem(record, now),
    tracker: buildClaimTracker(record),
    facts: {
      orderId: record.order_id,
      provider: record.provider,
      payer: record.payer,
      product: record.product,
      dos: s(record.scheduled_dos || record.order_date) || "Pending",
      rep: s(record.assigned_to || record.assignee) || "Unassigned",
    },
  }));
  const actions: MobileAction[] = cases.flatMap((record) => {
    const category = actionCategory(record); if (!category) return [];
    const item = normalizeRevenueItem(record, now);
    const deadline = iso(record.appeal_deadline ?? record.filing_deadline);
    const deadlineDays = deadline ? Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000) : null;
    const risk = item.expectedCollectibleAmount;
    const age = item.daysOutstanding ?? daysSince(record.created_at, now) ?? 0;
    const priority = (deadlineDays !== null && deadlineDays >= 0 ? Math.max(0, 10_000 - deadlineDays * 100) : 0) + (risk ?? 0) + age;
    return [{ id: `${category}:${record.id}`, category, caseId: record.id, patient: record.patient_name, provider: record.provider,
      payer: record.payer, product: record.product, currentStage: getStageLabel(record.status), revenueAtRisk: risk,
      blocker: item.blocker || category.replaceAll("_", " "), nextAction: item.nextAction, age, priority, deadline }];
  }).sort((a, b) => b.priority - a.priority);

  const buckets = ["TODAY", "NEXT_7_DAYS", "DAYS_8_14", "DAYS_15_30", "DAYS_31_60", "DAYS_61_PLUS", "UNSCHEDULED"]
    .map((key) => {
      const rows = items.filter((item) => item.expectedCollectibleAmount !== null && forecastBucket(item.expectedPaymentDate, now) === key);
      return { key, expectedCash: rows.reduce((sum, item) => sum + (item.expectedCollectibleAmount || 0), 0), claims: rows.length,
        majorPayers: Array.from(new Set(rows.map((item) => item.payer).filter(Boolean))).slice(0, 3),
        confidence: rows.length && rows.every((item) => item.forecastConfidence === "HIGH") ? "HIGH" : rows.some((item) => item.forecastConfidence !== "UNKNOWN") ? "MIXED" : "UNKNOWN" };
    });
  const submitted = items.reduce((sum, item) => sum + item.submittedAmount, 0);
  const expected = items.reduce((sum, item) => sum + (item.expectedCollectibleAmount || 0), 0);
  const collected = cases.reduce((sum, record) => sum + (n(record.paid_amount ?? record.payment_amount) || 0), 0);
  const ar = cases.reduce((sum, record) => sum + (n(record.balance_amount ?? record.outstanding_amount) || 0), 0);
  const counts = actions.reduce<Record<string, number>>((out, action) => ({ ...out, [action.category]: (out[action.category] || 0) + 1 }), {});
  return { generatedAt: now.toISOString(), kpis: { revenueSubmitted: submitted, expectedRevenue: expected, collected, arOutstanding: ar }, buckets, actionCounts: counts, actions, items };
}

export function buildClaimTracker(record: SpearCase): MobileTrackerStep[] {
  const state = (...values: unknown[]) => values.map((value) => s(value).toLowerCase()).filter(Boolean);
  const complete = (values: string[], matches: string[]) => values.some((value) => matches.some((match) => value.includes(match)));
  const failed = (values: string[]) => complete(values, ["denied", "rejected", "failed", "blocked", "cancelled"]);
  const step = (key: string, label: string, values: string[], done: string[], detail: string): MobileTrackerStep => ({
    key, label, status: failed(values) ? "blocked" : complete(values, done) ? "complete" : "pending", detail,
  });
  const workflow = state(record.status);
  const fax = state(record.fax_status, record.provider_packet_status, record.status);
  const signature = state(record.signature_status, record.swo_status, record.status);
  const auth = state(record.authorization_status, record.auth_status);
  const billing = state(record.claim_status, record.billing_status, record.tebra_status);
  const delivery = state(record.shipping_status, record.fulfillment_status, record.pod_status, record.status);
  const payment = state(record.payment_status, record.claim_status, record.billing_status);
  const moneyPaid = n(record.paid_amount ?? record.payment_amount) || 0;
  const authDisplay = s(record.authorization_status || record.auth_status) || "Pending";
  const billingDate = iso(record.claim_submitted_at ?? record.submitted_at);
  const paidDate = iso(record.paid_at ?? record.payment_date ?? record.remittance_payment_date);

  return [
    step("scheduled", "Scheduled", state(record.order_date, record.scheduled_dos, ...workflow), ["scheduled", "created", "intake", "review", "generated", "signed", "ready", "delivery", "closed"], s(record.scheduled_dos || record.order_date) || "Date not scheduled"),
    step("sent", "Sent", fax, ["sent", "delivered", "requested", "signed", "received"], s(record.fax_sent_at || record.provider_packet_sent_at) || "Provider packet pending"),
    step("signed", "Signed", signature, ["signed", "received", "complete"], s(record.signed_at || record.swo_signed_at) || "Provider signature pending"),
    { key: "notes", label: "Notes", status: s(record.notes || record.clinical_notes) ? "complete" : "pending", detail: s(record.notes || record.clinical_notes) || "No notes entered" },
    step("authorization", "Authorization", auth, ["approved", "authorized", "no_auth", "not_required", "nar"], authDisplay.replaceAll("_", " ")),
    step("billing", "Billing", billing, ["submitted", "accepted", "paid", "posted"], billingDate ? `Submitted ${new Date(billingDate).toLocaleDateString("en-US")}` : s(record.claim_status || record.billing_status) || "Pending submission"),
    step("shipped", "Shipped / POD", delivery, ["shipped", "delivered", "signed_pod", "complete"], s(record.tracking_number || record.pod_status || record.shipping_status) || "Fulfillment pending"),
    { key: "paid", label: "Paid", status: moneyPaid > 0 || complete(payment, ["paid", "posted"]) ? "complete" : failed(payment) ? "blocked" : "pending", detail: paidDate ? `Paid ${new Date(paidDate).toLocaleDateString("en-US")}` : moneyPaid > 0 ? `$${moneyPaid.toLocaleString("en-US")}` : "Payment pending" },
  ];
}
