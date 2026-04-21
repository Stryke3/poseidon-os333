# UI — canonical Intake POC

## Prerequisites

- Stack running (`docker compose up -d` or `./scripts/docker-up.sh`).
- Log in to the dashboard (session must include `org_id` from Core).

## Steps

1. Open **Patient Intake**: `/intake/new` (Basic Front-End Intake).
2. **Minimal intake (review queue)**  
   - Fill **First name**, **Last name**, **Date of birth** only.  
   - Submit.  
   - **Expected:** Success copy: *Patient created; additional information required — queued for review.* (Intake `review_queued: true`, no `order_id`).
3. Submit the **same** patient again with the same fields (optionally same session).  
   - **Expected:** Idempotent messaging (duplicate / already queued), no duplicate review row (Intake handles fingerprint).
4. **Complete intake (patient + order)**  
   - Fill patient demographics, **Insurance payer**, **Member ID**, ICD-10, HCPCS, **Referring NPI**, and other order fields as needed.  
   - Submit.  
   - **Expected:** *Patient created and order created (…)* and optional document uploads run against the new order id. A **Trident (learned signal)** panel appears below with `learned_adjustment`, `confidence`, `features_used`, and short interpretation (high/low confidence, strong/limited history).
5. **Minimal intake + Trident:** With only name + DOB, submit. **Expected:** Trident panel explains that payer + ICD-10 + HCPCS are needed for a score preview.
6. **Optional:** `POSEIDON_DATABASE_URL=… psql` — `SELECT * FROM intake_review_queue ORDER BY created_at DESC LIMIT 3;`

## Fax OCR Intake tab (StrykeFox)

1. Open **`/fax`** (StrykeFox fax UI).
2. Go to **OCR Intake** tab, mode **New** (not “existing chart”).
3. Run OCR / fill patient fields. Submit **Save** / save intake.
4. **Expected:** Same backend as `/intake/new`: `POST /api/intake/patient` → Intake service. Low client OCR confidence is sent as `parse_confidence` so Intake can queue review instead of hard-failing in the UI.
5. With **payer + ICD-10 + HCPCS** filled, after save a **Trident** strip under the success banner shows learned signal (same as `/intake/new`).
6. **Existing chart** mode still updates via Core `PATCH /api/patients/:id` (not Intake canonical).

## Automated tests

The repo typechecks the dashboard (`npx tsc --noEmit` in `frontend/`). There is no Jest suite in this package; verify the flows above in the browser.
