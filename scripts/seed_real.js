const pg = require("pg");
const XLSX = require("xlsx");

const CONN =
  "postgresql://neondb_owner:npg_x8CiDQyjMS5p@ep-shy-cherry-akxipuq8-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";
const DME_ORG = "00000000-0000-0000-0000-000000000001";
const ADMIN = "00000000-0000-0000-0000-000000000099";

// Excel date serial to ISO string
function xlDate(v) {
  if (!v) return null;
  if (typeof v === "string" && v.includes("/")) return v;
  const n = Number(v);
  if (!n || n < 10000) return null;
  const d = new Date((n - 25569) * 86400000);
  return d.toISOString().slice(0, 10);
}

function parseName(raw) {
  const name = (raw || "").trim();
  if (!name) return null;
  // "Last, First" or "First Last"
  if (name.includes(",")) {
    const [last, first] = name.split(",").map((s) => s.trim());
    return { first: first || "", last: last || "" };
  }
  const parts = name.split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
}

function mapPayer(raw) {
  const p = (raw || "").toLowerCase();
  if (p.includes("medicare dmerc")) return "MEDICARE_DMERC";
  if (p.includes("aetna medicare")) return "AETNA";
  if (p.includes("aetna")) return "AETNA";
  if (p.includes("humana hmo")) return "HUMANA";
  if (p.includes("humana")) return "HUMANA";
  if (p.includes("cigna")) return "CIGNA";
  if (p.includes("bcbs") || p.includes("blue cross")) return "BCBS";
  if (p.includes("medicaid")) return "MEDICAID";
  if (p.includes("alignment")) return "ANTHEM";
  if (p.includes("culinary")) return "CENTENE";
  if (p.includes("great american")) return "ANTHEM";
  if (p.includes("select health") || p.includes("intermountain")) return "HUMANA";
  if (p.includes("aarp")) return "MEDICARE_DMERC";
  if (p.includes("tricare")) return "TRICARE";
  if (p.includes("united") || p.includes("uhc")) return "UHC";
  if (p.includes("oscar")) return "OSCAR";
  if (p.includes("molina")) return "MOLINA";
  if (p.includes("sierra health")) return "UHC";
  if (p.includes("patient")) return null; // skip patient-pay only
  return "OTHER";
}

function mapStatus(raw) {
  const s = (raw || "").toLowerCase();
  if (s.includes("paid") || s.includes("pat :")) return "paid";
  if (s.includes("denied") || s.includes("epd")) return "denied";
  if (s.includes("appeal")) return "appealed";
  if (s.includes("adjusted") || s.includes("51ad")) return "paid";
  if (s.includes("rejected") || s.includes("inr")) return "denied";
  if (s.includes("submitted")) return "submitted";
  return "submitted";
}

async function run() {
  const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to Neon");

  // Clear seed data
  await client.query("DELETE FROM order_line_items");
  await client.query("DELETE FROM orders");
  await client.query("DELETE FROM patient_insurances");
  await client.query("DELETE FROM patients");
  console.log("Cleared previous data");

  // Read the Report sheet (386 rows, full claim detail)
  const wb = XLSX.readFile("data/lvco/LVCO -Stryke fox payment Summary as of 03032026.xlsx");
  const report = XLSX.utils.sheet_to_json(wb.Sheets["Report"], { defval: "" });

  // Read claims tracker for additional patients
  const wb2 = XLSX.readFile("data/lvco/2. LVCO Claims - tracker_UPDATED_FEB1500_ONLY_2026-02-18.xlsx");
  const billed = XLSX.utils.sheet_to_json(wb2.Sheets["Billed"], { defval: "" });
  const combined = XLSX.utils.sheet_to_json(wb2.Sheets["Combined"], { defval: "" });
  const finished = XLSX.utils.sheet_to_json(wb2.Sheets["Finished"], { defval: "" });
  const appealed = XLSX.utils.sheet_to_json(wb2.Sheets["Appealed"], { defval: "" });

  // Collect unique patients from all sources
  const patientMap = new Map();

  // From Report (most detail)
  for (const r of report) {
    const parsed = parseName(r["Patient Name"]);
    if (!parsed) continue;
    const acct = String(r["Patient Acct No"] || "").trim();
    const key = `${parsed.last}|${parsed.first}|${acct}`;
    if (!patientMap.has(key)) {
      patientMap.set(key, {
        ...parsed,
        acct,
        payer: r["Payer Name"] || r["Payer Name_1"] || "",
        facility: r["Facility Name"] || "",
        claims: [],
      });
    }
    patientMap.get(key).claims.push({
      cpt: r["CPT Code"] || "",
      icd1: r["ICD1 Code"] || "",
      icd2: r["ICD2 Code"] || "",
      icd3: r["ICD3 Code"] || "",
      icd4: r["ICD4 Code"] || "",
      status: r["Current Claim Status"] || "",
      claimNo: r["Claim No"] || "",
      serviceDate: xlDate(r["Service Date"]),
      claimDate: xlDate(r["Claim Date"]),
      paymentDate: xlDate(r["Payment Date"]),
      payment: parseFloat(String(r["Payment"] || "0").replace(/[$,]/g, "")) || 0,
      payerPayment: parseFloat(String(r["Payer Payment"] || "0").replace(/[$,]/g, "")) || 0,
      patientPayment: parseFloat(String(r["Patient Payment"] || "0").replace(/[$,]/g, "")) || 0,
      contractual: parseFloat(String(r["Contractual Adjustment"] || "0").replace(/[$,]/g, "")) || 0,
      modifier1: r["Modifier 1"] || "",
    });
  }

  // From tracker sheets (may have patients not in Report)
  for (const sheet of [billed, combined, finished, appealed]) {
    for (const r of sheet) {
      const rawName = r["Patient Name"] || r[" "] || "";
      const parsed = parseName(rawName);
      if (!parsed) continue;
      const key = `${parsed.last}|${parsed.first}|`;
      if (!patientMap.has(key)) {
        const ins = r["Insurance "] || "";
        patientMap.set(key, {
          ...parsed,
          acct: "",
          payer: ins,
          facility: "Las Vegas Concierge Orthopedics",
          claims: [],
        });
      }
    }
  }

  console.log(`Found ${patientMap.size} unique patients`);

  // Insert patients
  const dbPatients = new Map();
  let pOk = 0;
  for (const [key, p] of patientMap) {
    const payerId = mapPayer(p.payer);
    const mrn = p.acct ? `LVCO-${p.acct}` : `LVCO-${p.last.toUpperCase().slice(0, 4)}${p.first.toUpperCase().slice(0, 2)}`;
    const diagCodes = [];
    for (const c of p.claims) {
      if (c.icd1 && !diagCodes.includes(c.icd1)) diagCodes.push(c.icd1);
      if (c.icd2 && !diagCodes.includes(c.icd2)) diagCodes.push(c.icd2);
      if (c.icd3 && !diagCodes.includes(c.icd3)) diagCodes.push(c.icd3);
      if (c.icd4 && !diagCodes.includes(c.icd4)) diagCodes.push(c.icd4);
    }

    try {
      const res = await client.query(
        `INSERT INTO patients (org_id, mrn, first_name, last_name, payer_id, insurance_id, diagnosis_codes, territory_id, active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'NV-LV', true, $8)
         ON CONFLICT (org_id, mrn) DO UPDATE SET first_name=EXCLUDED.first_name RETURNING id`,
        [DME_ORG, mrn, p.first, p.last, payerId, p.acct, JSON.stringify(diagCodes), ADMIN]
      );
      dbPatients.set(key, { id: res.rows[0].id, ...p, payerId });
      pOk++;
    } catch (e) {
      console.log(`patient skip: ${p.first} ${p.last}: ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`${pOk} patients inserted`);

  // Insert insurance records
  let iOk = 0;
  for (const [, p] of dbPatients) {
    if (!p.payerId) continue;
    try {
      await client.query(
        `INSERT INTO patient_insurances (patient_id, payer_name, payer_id, member_id, is_primary, is_active, eligibility_status)
         VALUES ($1, $2, $3, $4, true, true, 'verified')
         ON CONFLICT DO NOTHING`,
        [p.id, p.payer, p.payerId, p.acct]
      );
      iOk++;
    } catch (e) {}
  }
  console.log(`${iOk} insurance records`);

  // Insert orders from claims
  let oOk = 0;
  for (const [key, p] of dbPatients) {
    if (!p.claims || p.claims.length === 0) continue;

    // Group claims by claim number or CPT to avoid dupes
    const seen = new Set();
    for (const c of p.claims) {
      const claimKey = c.claimNo || `${c.cpt}-${c.serviceDate}`;
      if (seen.has(claimKey)) continue;
      seen.add(claimKey);

      const status = mapStatus(c.status);
      const hcpcs = c.cpt ? [c.cpt] : [];
      const diagCodes = [c.icd1, c.icd2, c.icd3, c.icd4].filter(Boolean);
      const totalBilled = Math.abs(c.payment) || Math.abs(c.payerPayment) || 0;
      const totalPaid = c.payerPayment || 0;
      const dos = c.serviceDate || c.claimDate || null;

      try {
        const res = await client.query(
          `INSERT INTO orders (org_id, patient_id, status, product_category, vertical, priority,
           territory_id, hcpcs_codes, total_billed, total_paid, paid_amount, date_of_service,
           source_channel, source_reference, created_by, assigned_rep_id, notes)
           VALUES ($1, $2, $3, $4, 'dme', $5, 'NV-LV', $6::jsonb, $7, $8, $8, $9::date,
           'lvco_import', $10, $11, $11, $12)
           RETURNING id`,
          [
            DME_ORG, p.id, status,
            c.cpt || "DME Device",
            status === "denied" || status === "appealed" ? "high" : "normal",
            JSON.stringify(hcpcs),
            totalBilled > 0 ? totalBilled : null,
            totalPaid !== 0 ? totalPaid : null,
            dos,
            c.claimNo || null,
            ADMIN,
            `Claim: ${c.claimNo || "N/A"} | Status: ${c.status} | Modifier: ${c.modifier1}`,
          ]
        );

        // Line item
        if (c.cpt) {
          await client.query(
            `INSERT INTO order_line_items (order_id, hcpcs_code, modifier, quantity, billed_amount, paid_amount, is_billable)
             VALUES ($1, $2, $3, 1, $4, $5, true)`,
            [res.rows[0].id, c.cpt, c.modifier1 || null, totalBilled || null, totalPaid || null]
          );
        }

        // Denial record if denied
        if (status === "denied" || status === "appealed") {
          await client.query(
            `INSERT INTO denials (order_id, org_id, payer_id, payer_name, denial_reason, billed_amount, denied_amount, denial_date, status, appeal_status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $6, $7::date, $8, $9, $10)`,
            [
              res.rows[0].id, DME_ORG, p.payerId, p.payer,
              c.status,
              totalBilled || 0,
              c.paymentDate,
              status === "appealed" ? "appealed" : "new",
              status === "appealed" ? "submitted" : "pending",
              ADMIN,
            ]
          );
        }

        oOk++;
      } catch (e) {
        console.log(`order skip: ${p.first} ${p.last} ${c.cpt}: ${e.message.slice(0, 80)}`);
      }
    }
  }
  console.log(`${oOk} orders with line items`);

  // Summary
  const summary = await client.query(
    `SELECT 'patients' as entity, count(*) FROM patients UNION ALL
     SELECT 'orders', count(*) FROM orders UNION ALL
     SELECT 'line_items', count(*) FROM order_line_items UNION ALL
     SELECT 'insurances', count(*) FROM patient_insurances UNION ALL
     SELECT 'denials', count(*) FROM denials UNION ALL
     SELECT 'payers', count(*) FROM payers`
  );
  console.log("\n=== DATABASE TOTALS ===");
  summary.rows.forEach((r) => console.log(`  ${r.entity}: ${r.count}`));

  // Show some patients
  const pts = await client.query(
    "SELECT first_name, last_name, mrn, payer_id FROM patients ORDER BY last_name LIMIT 20"
  );
  console.log("\n=== PATIENTS ===");
  pts.rows.forEach((r) => console.log(`  ${r.last_name}, ${r.first_name} | MRN: ${r.mrn} | Payer: ${r.payer_id}`));

  await client.end();
}

run().catch((e) => console.error("FATAL:", e.message));
