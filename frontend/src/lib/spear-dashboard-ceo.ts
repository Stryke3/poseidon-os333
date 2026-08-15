import { listCases } from "@/lib/poseidon-store";

type Row = Record<string, unknown>;

function arr<T = Row>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value: unknown) {
  const date = dateValue(value);
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function bucket(days: number) {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function payerName(caseRecord: Row) {
  return String(caseRecord.canonical_payer || caseRecord.payer || "Unknown").trim() || "Unknown";
}

function claimAmount(claim: Row) {
  return num(claim.submittedAmount || claim.submitted_amount || claim.billedAmount || claim.billed_amount);
}

function remittancePaid(remittance: Row) {
  return num(remittance.paidAmount || remittance.paid_amount || remittance.totalPayment || remittance.total_payment);
}

function weekKey(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const week = Math.ceil((diff + start.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getCeoDashboardSnapshot() {
  const cases = await listCases();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const caseRows = cases as Row[];
  const claims: Array<Row & { caseRecord: Row }> = caseRows.flatMap((caseRecord) => arr<Row>(caseRecord.claims).map((claim) => ({ ...claim, caseRecord })));
  const remittances: Array<Row & { caseRecord: Row }> = caseRows.flatMap((caseRecord) => arr<Row>(caseRecord.remittances).map((remittance) => ({ ...remittance, caseRecord })));
  const exceptions: Array<Row & { caseRecord: Row }> = caseRows.flatMap((caseRecord) => arr<Row>(caseRecord.revenue_exceptions).map((exception) => ({ ...exception, caseRecord })));

  const monthClaims = claims.filter((claim) => {
    const date = dateValue(claim.submittedAt || claim.createdAt);
    return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });
  const monthRemittances = remittances.filter((remittance) => {
    const date = dateValue(remittance.paymentDate || remittance.createdAt);
    return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });

  const billedThisMonth = monthClaims.reduce((sum, claim) => sum + claimAmount(claim), 0);
  const collectedThisMonth = monthRemittances.reduce((sum, remittance) => sum + remittancePaid(remittance), 0);
  const totalBilled = claims.reduce((sum, claim) => sum + claimAmount(claim), 0);
  const totalCollected = remittances.reduce((sum, remittance) => sum + remittancePaid(remittance), 0);
  const expectedThisMonth = monthRemittances.reduce((sum, remittance) => sum + num(remittance.allowedAmount || remittance.allowed_amount), 0) || billedThisMonth;
  const arOutstanding = Math.max(0, totalBilled - totalCollected);
  const paidClaims = claims.filter((claim) => ["PAID", "PARTIAL", "PAYMENT_POSTED", "CLOSED"].includes(String(claim.status || "")));
  const avgDaysToPayment = paidClaims.length
    ? Math.round(paidClaims.reduce((sum, claim) => sum + daysSince(claim.submittedAt || claim.createdAt), 0) / paidClaims.length)
    : 0;
  const accepted = claims.filter((claim) => ["CLAIM_ACCEPTED", "PAYER_PROCESSING", "ADJUDICATED", "PAID", "PARTIAL", "PAYMENT_POSTED"].includes(String(claim.status || ""))).length;
  const denied = claims.filter((claim) => String(claim.status || "") === "DENIED").length;

  const pipeline = {
    intake: cases.filter((c) => ["created", "intake_received", "missing_docs", "trident_review"].includes(String(c.status || ""))).length,
    docsComplete: cases.filter((c) => ["provider_packet_generated", "provider_signature_requested", "signed_swo_received", "billing_packet_generated", "pod_generated", "delivery_recorded", "ready_to_bill"].includes(String(c.status || ""))).length,
    submitted: claims.filter((claim) => String(claim.status || "") === "CLAIM_SUBMITTED").length,
    acknowledged: claims.filter((claim) => String(claim.status || "") === "CLAIM_ACCEPTED").length,
    inPayment: claims.filter((claim) => ["PAYER_PROCESSING", "ADJUDICATED"].includes(String(claim.status || ""))).length,
    paid: claims.filter((claim) => ["PAID", "PAYMENT_POSTED", "CLOSED"].includes(String(claim.status || ""))).length,
    denied,
  };

  const weeklyMap = new Map<string, { week: string; billed: number; expected: number; collected: number; daysToPayment: number }>();
  for (const claim of claims) {
    const date = dateValue(claim.submittedAt || claim.createdAt) || now;
    const key = weekKey(date);
    const row = weeklyMap.get(key) || { week: key, billed: 0, expected: 0, collected: 0, daysToPayment: 0 };
    row.billed += claimAmount(claim);
    weeklyMap.set(key, row);
  }
  for (const remittance of remittances) {
    const date = dateValue(remittance.paymentDate || remittance.createdAt) || now;
    const key = weekKey(date);
    const row = weeklyMap.get(key) || { week: key, billed: 0, expected: 0, collected: 0, daysToPayment: 0 };
    row.expected += num(remittance.allowedAmount || remittance.allowed_amount);
    row.collected += remittancePaid(remittance);
    weeklyMap.set(key, row);
  }

  const payerAgingMap = new Map<string, { payer: string; bucket: string; amount: number; count: number }>();
  for (const claim of claims) {
    const payer = payerName(claim.caseRecord as Row);
    const key = `${payer}:${bucket(daysSince(claim.submittedAt || claim.createdAt))}`;
    const row = payerAgingMap.get(key) || { payer, bucket: key.split(":")[1], amount: 0, count: 0 };
    row.amount += claimAmount(claim);
    row.count += 1;
    payerAgingMap.set(key, row);
  }

  const denialMap = new Map<string, { reason: string; count: number; amount: number; pct: number }>();
  for (const exception of exceptions.filter((item) => ["DENIAL", "CLAIM_REJECTION", "AUTHORIZATION", "DOCUMENTATION"].includes(String(item.category || "")))) {
    const reason = String(exception.title || exception.category || "Other");
    const row = denialMap.get(reason) || { reason, count: 0, amount: 0, pct: 0 };
    row.count += 1;
    row.amount += num(exception.amount || (exception.caseRecord as Row)?.claim_amount);
    denialMap.set(reason, row);
  }
  const denialReasons = Array.from(denialMap.values());
  const denialTotal = denialReasons.reduce((sum, row) => sum + row.count, 0) || 1;
  denialReasons.forEach((row) => { row.pct = Math.round((row.count / denialTotal) * 100); });

  return {
    snapshotAt: now.toISOString(),
    kpis: {
      billedThisMonth,
      expectedThisMonth,
      collectedThisMonth,
      arOutstanding,
      avgDaysToPayment,
      realizationRate: billedThisMonth ? collectedThisMonth / billedThisMonth : 0,
      cleanClaimRate: claims.length ? accepted / claims.length : 0,
    },
    pipeline,
    weeklyRevenue: Array.from(weeklyMap.values()).sort((a, b) => a.week.localeCompare(b.week)).slice(-8),
    payerAging: Array.from(payerAgingMap.values()),
    denialReasons,
    appealStatus: {
      drafted: exceptions.filter((row) => String(row.status || "") === "DRAFTED").length,
      submitted: exceptions.filter((row) => String(row.status || "") === "SUBMITTED").length,
      pending: exceptions.filter((row) => String(row.status || "") === "OPEN").length,
      wonAmount: remittances.filter((row) => String(row.status || "") === "PAID").reduce((sum, row) => sum + remittancePaid(row), 0),
      lostAmount: denied,
      winRate: remittances.length ? remittances.filter((row) => remittancePaid(row) > 0).length / remittances.length : 0,
    },
    upcomingDeadlines: exceptions
      .map((exception) => {
        const deadline = dateValue(exception.appealDeadline || exception.deadline);
        if (!deadline) return null;
        const hoursRemaining = Math.floor((deadline.getTime() - Date.now()) / 36e5);
        return { caseId: String(exception.caseId || (exception.caseRecord as Row)?.id || ""), deadline: deadline.toISOString(), type: String(exception.category || "deadline").toLowerCase(), amount: num(exception.amount), hoursRemaining };
      })
      .filter((row): row is { caseId: string; deadline: string; type: string; amount: number; hoursRemaining: number } => Boolean(row && row.hoursRemaining >= 0 && row.hoursRemaining <= 72)),
  };
}
