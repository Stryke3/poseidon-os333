const pg = require("pg");

// Secret must be supplied via environment. Never commit a DB URL.
// Valid env vars (in priority order): POSEIDON_DATABASE_URL, DATABASE_URL.
const CONN = process.env.POSEIDON_DATABASE_URL || process.env.DATABASE_URL;
if (!CONN) {
  console.error(
    "Missing DB URL. Set POSEIDON_DATABASE_URL or DATABASE_URL before running this seed script.",
  );
  process.exit(1);
}

const DME = "00000000-0000-0000-0000-000000000001";
const BIO = "00000000-0000-0000-0000-000000000002";
const MOB = "00000000-0000-0000-0000-000000000003";
const ADMIN = "00000000-0000-0000-0000-000000000099";

const patients = [
  // DME
  [DME,"DME-10001","James","Richardson","1958-03-14","M","(469) 555-0112","4521 Elm Creek Dr","Dallas","TX","75201","MEDICARE_DMERC","MBI1234567A",'["M17.11","J44.1"]',"TX-DFW"],
  [DME,"DME-10002","Patricia","Womack","1945-07-22","F","(214) 555-0198","892 Oak Lawn Ave","Dallas","TX","75219","UHC","UHC998877201",'["M79.3","G89.29"]',"TX-DFW"],
  [DME,"DME-10003","Robert","Chen","1962-11-05","M","(972) 555-0145","1100 Commerce St Apt 4B","Plano","TX","75074","BCBS","XYK887766123",'["E11.65","M25.551"]',"TX-DFW"],
  [DME,"DME-10004","Maria","Gonzalez","1970-04-18","F","(817) 555-0167","3300 W 7th St","Fort Worth","TX","76107","AETNA","AET443322110",'["J44.1","J96.10"]',"TX-FW"],
  [DME,"DME-10005","William","Parker","1953-09-30","M","(469) 555-0133","7800 Greenville Ave","Dallas","TX","75231","HUMANA","HUM556677889",'["M16.11"]',"TX-DFW"],
  [DME,"DME-10006","Dorothy","Williams","1940-12-08","F","(214) 555-0177","1500 Marilla St","Dallas","TX","75201","MEDICARE_DMERC","MBI9988776B",'["M54.5","M79.3"]',"TX-DFW"],
  [DME,"DME-10007","Thomas","Bryant","1967-06-25","M","(972) 555-0122","2200 Ross Ave","Dallas","TX","75201","CIGNA","CGN112233445",'["E11.65","E11.621"]',"TX-DFW"],
  // Biologics
  [BIO,"BIO-20001","Angela","Foster","1975-02-14","F","(469) 555-0201","5600 W Lovers Ln","Dallas","TX","75209","BCBS","XYK554433221",'["M17.11","M17.12"]',"TX-DFW"],
  [BIO,"BIO-20002","Charles","Mitchell","1960-08-19","M","(214) 555-0234","3900 Lemmon Ave","Dallas","TX","75219","UHC","UHC776655443",'["M17.0","M25.561"]',"TX-DFW"],
  [BIO,"BIO-20003","Karen","Reeves","1968-05-03","F","(972) 555-0256","1800 N Pearl St","Dallas","TX","75201","AETNA","AET998877665",'["M54.5","M51.16"]',"TX-DFW"],
  [BIO,"BIO-20004","David","Hawkins","1955-10-27","M","(817) 555-0278","4200 Camp Bowie Blvd","Fort Worth","TX","76107","MEDICARE_DMERC","MBI5566778C",'["M17.11","M79.3"]',"TX-FW"],
  [BIO,"BIO-20005","Susan","Torres","1972-01-16","F","(469) 555-0289","6100 Berkshire Ln","Dallas","TX","75225","CIGNA","CGN667788990",'["M19.011","M25.511"]',"TX-DFW"],
  // Mobility / Tek RMD
  [MOB,"MOB-30001","Michael","Carter","1982-04-11","M","(469) 555-0301","9200 Skillman St","Dallas","TX","75243","MEDICARE_DMERC","MBI3344556D",'["G82.20","G95.89"]',"TX-DFW"],
  [MOB,"MOB-30002","Linda","Vasquez","1978-09-08","F","(214) 555-0322","2700 Canton St","Dallas","TX","75226","UHC","UHC334455667",'["G35","G82.20"]',"TX-DFW"],
  [MOB,"MOB-30003","Steven","Jackson","1990-12-02","M","(972) 555-0344","4100 Gaston Ave","Dallas","TX","75246","BCBS","XYK112299887",'["T91.11XA","G82.21"]',"TX-DFW"],
  [MOB,"MOB-30004","Barbara","Nguyen","1965-07-20","F","(817) 555-0366","5500 Hulen St","Fort Worth","TX","76132","HUMANA","HUM889900112",'["G80.0","M62.81"]',"TX-FW"],
  [MOB,"MOB-30005","Richard","Patel","1988-03-15","M","(469) 555-0388","8300 Douglas Ave","Dallas","TX","75225","TRICARE","TRI445566778",'["T91.11XA","G82.20"]',"TX-DFW"],
  [MOB,"MOB-30006","Jennifer","Okafor","1973-11-28","F","(214) 555-0399","3100 McKinney Ave","Dallas","TX","75204","MEDICAID","MCD778899001",'["G12.21","G82.20"]',"TX-DFW"],
];

const orders = [
  // DME orders
  ["DME-10001","intake","L1833","Knee Brace",980,"dme","high"],
  ["DME-10001","pending_auth","E0470","BiPAP",2400,"dme","normal"],
  ["DME-10002","auth_approved","E0745","Neuromuscular Stimulator",1200,"dme","normal"],
  ["DME-10003","submitted","A4253","Diabetic Test Strips",320,"dme","low"],
  ["DME-10003","pending_auth","L1686","Hip Brace",1450,"dme","high"],
  ["DME-10004","pending_payment","E0260","Hospital Bed",1800,"dme","normal"],
  ["DME-10005","denied","L1833","Knee Brace",980,"dme","high"],
  ["DME-10006","paid","E0676","Compression Device",950,"dme","normal"],
  ["DME-10006","intake","L1832","Knee Brace",680,"dme","low"],
  ["DME-10007","submitted","E0470","BiPAP",2400,"dme","normal"],
  // Biologics orders
  ["BIO-20001","intake","J7325","Hyalgan Injection",1450,"biologics","normal"],
  ["BIO-20001","pending_auth","Q4131","EpiFix Graft",3800,"biologics","high"],
  ["BIO-20002","auth_approved","J7324","Orthovisc Injection",1650,"biologics","normal"],
  ["BIO-20003","submitted","Q4132","Grafix Core",4200,"biologics","high"],
  ["BIO-20003","denied","J0775","Collagenase Injection",2100,"biologics","normal"],
  ["BIO-20004","pending_payment","J7325","Hyalgan Injection",1450,"biologics","low"],
  ["BIO-20005","paid","J7324","Orthovisc Injection",1650,"biologics","normal"],
  // Mobility orders
  ["MOB-30001","intake","K0823","Power Wheelchair Group 2",35999,"mobility","high"],
  ["MOB-30001","pending_auth","E2351","Seat Tilt System",4200,"mobility","normal"],
  ["MOB-30002","auth_approved","K0856","Power Wheelchair Group 3",42750,"mobility","high"],
  ["MOB-30003","submitted","K0890","Tek RMD Power Standing",67500,"mobility","high"],
  ["MOB-30003","pending_auth","K0005","Ultralight Wheelchair",4800,"mobility","normal"],
  ["MOB-30004","denied","K0891","Tek RMD Standing HD",72000,"mobility","high"],
  ["MOB-30005","pending_payment","K0823","Power Wheelchair Group 2",35999,"mobility","normal"],
  ["MOB-30006","paid","K0856","Power Wheelchair Group 3",42750,"mobility","high"],
  ["MOB-30006","intake","E2351","Seat Tilt System",4200,"mobility","low"],
];

async function run() {
  const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to Neon");

  // Insert patients
  const patientMap = {};
  let pOk = 0;
  for (const p of patients) {
    const [org,mrn,fn,ln,dob,gender,phone,addr,city,st,zip,payer,ins,diag,terr] = p;
    try {
      const addrJson = JSON.stringify({ line1: addr, city, state: st, zip });
      const r = await client.query(
        `INSERT INTO patients (org_id,mrn,first_name,last_name,date_of_birth,dob,gender,phone,address_line1,city,state,zip_code,payer_id,insurance_id,diagnosis_codes,territory_id,address,active,created_by)
         VALUES ($1,$2,$3,$4,$5::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,true,$17)
         ON CONFLICT (org_id,mrn) DO UPDATE SET first_name=EXCLUDED.first_name RETURNING id`,
        [org,mrn,fn,ln,dob,gender,phone,addr,city,st,zip,payer,ins,diag,terr,addrJson,ADMIN]
      );
      patientMap[mrn] = { id: r.rows[0].id, org };
      pOk++;
    } catch(e) { console.log("patient skip:", mrn, e.message.slice(0,60)); }
  }
  console.log(`${pOk} patients`);

  // Insert insurance
  for (const p of patients) {
    const [org,mrn,,,,,,,,,,payer,ins] = p;
    const pid = patientMap[mrn]?.id;
    if (!pid) continue;
    try {
      await client.query(
        `INSERT INTO patient_insurances (patient_id,payer_name,payer_id,member_id,is_primary,is_active,eligibility_status)
         VALUES ($1,$2,$3,$4,true,true,'eligible') ON CONFLICT DO NOTHING`,
        [pid, payer.replace(/_/g," "), payer, ins]
      );
    } catch(e) {}
  }
  console.log("insurance records added");

  // Insert orders
  let oOk = 0;
  for (const o of orders) {
    const [mrn,status,hcpcs,prodCat,amt,vert,priority] = o;
    const p = patientMap[mrn];
    if (!p) { console.log("no patient for", mrn); continue; }
    const dosOffset = Math.floor(Math.random() * 90);
    const dos = new Date(Date.now() - dosOffset * 86400000).toISOString().slice(0,10);
    try {
      const r = await client.query(
        `INSERT INTO orders (org_id,patient_id,status,product_category,vertical,priority,territory_id,hcpcs_codes,total_billed,date_of_service,source_channel,created_by,assigned_rep_id)
         VALUES ($1,$2,$3,$4,$5,$6,'TX-DFW',$7::jsonb,$8,$9,'seed',$10,$10) RETURNING id`,
        [p.org, p.id, status, prodCat, vert, priority, JSON.stringify([hcpcs]), amt, dos, ADMIN]
      );
      // Line item
      await client.query(
        `INSERT INTO order_line_items (order_id,hcpcs_code,quantity,billed_amount,is_billable) VALUES ($1,$2,1,$3,true)`,
        [r.rows[0].id, hcpcs, amt]
      );
      oOk++;
    } catch(e) { console.log("order skip:", mrn, e.message.slice(0,60)); }
  }
  console.log(`${oOk} orders with line items`);

  // Summary
  const summary = await client.query(
    `SELECT 'patients' as entity, count(*) FROM patients UNION ALL
     SELECT 'orders', count(*) FROM orders UNION ALL
     SELECT 'line_items', count(*) FROM order_line_items UNION ALL
     SELECT 'insurances', count(*) FROM patient_insurances UNION ALL
     SELECT 'payers', count(*) FROM payers`
  );
  console.log("\n=== DATABASE TOTALS ===");
  summary.rows.forEach(r => console.log(`  ${r.entity}: ${r.count}`));

  await client.end();
}

run().catch(e => console.error("FATAL:", e.message));
