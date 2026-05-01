# SUPER TRIDENT — LOCAL HARD PASS AUDIT

## 1. FINAL VERDICT

**FAIL**

## 2. EXECUTIVE TRUTH

This repository is **not** converted to a **narrow, end-to-end SUPER TRIDENT OCR intelligence engine** that is provably exclusive of broad Poseidon EMR/CRM/EDI/claims behavior. The **Trident case path** (Lite + `trident-engine`) can produce **text** SWO and addendum-style outputs from **manually entered or inferred** patient data, but **scanned-PDF OCR**, **per-page traceability**, **mixed-patient rejection**, and **conflicting-DOB** handling are **not** implemented to the locked bar. **Intake** has **pdfplumber** text extraction (not raster OCR) on a **separate** service. The **codebase still contains** EDI/837P, CMS-1500, patient chart, fax, denials, and **Trident 3.0** POD/Tebra/coding-cover paths. **No running stack** was available in the audit environment; **no** end-to-end upload→review→generate run was **executed**. **Render** is deprecated in **docs**; a **`render.com` host string** remains in `services/shared/base.py` for DB TLS. **DO + compose** is documented as canonical; **not** booted here.

## 3. PASS/FAIL MATRIX

| Criterion | Result |
|-----------|--------|
| Route reduction | **FAIL** |
| Upload pipeline | **PARTIAL** |
| OCR/text extraction | **FAIL** |
| Page classification | **FAIL** |
| Case grouping | **PARTIAL** |
| Structured extraction | **PARTIAL** |
| Review UI | **PARTIAL** |
| Rules engine | **PARTIAL** |
| Code conflict handling | **PARTIAL** |
| SWO generation | **PARTIAL** |
| Addendum generation | **PARTIAL** |
| Delivery receipt exclusion | **FAIL** |
| 1500/claims exclusion | **FAIL** |
| Internal export preservation | **FAIL** |
| Audit trail | **PARTIAL** |
| Render removal / DO canonical | **PARTIAL** |
| Build/runtime viability | **FAIL** |

## 4. WHAT WAS VERIFIED

- `pwd`, `git` branch, status, `git log -1` (see `00_repo_identity.txt`).
- Read `frontend/middleware.ts`, `frontend/src/app/trident/layout.tsx`, `frontend/src/lib/trident-engine.ts` (rules, extraction fields).
- Read `services/intake/main.py` `_extract_pdf_text` / `_parse_pdf_content` (pdfplumber, not tesseract).
- Read `services/lite/main.py` generation types and `generate_swo_content` / `generate_transmittal_content`.
- Grep-based inventory: EDI/837P/CMS-1500, Trident30 POD, `api` route surface.
- `curl` to `127.0.0.1:3000` and `:8010`: **connection refused** (no services).
- Build: **not** completed with log in this pass (`04_build_log.txt`).

## 5. FILES CHANGED

**NONE** in product code. **Audit-only** files under `audit_tmp/super_trident_hard_pass/`.

## 6. FAILURES / BLOCKERS

- **severity: CRITICAL — component: Runtime** — **No** local Next or Lite process listening; **no** E2E HTTP proof. **Blocks** every “verify” item that requires a running app.
- **severity: CRITICAL — component: Layer A scope** — EDI/837P/CMS-1500/fax/denials/patients **components and API routes** remain in the repo; middleware does **not** block `/api/edi` and similar. **Blocks** “forbidden outputs not in active product.”
- **severity: CRITICAL — component: OCR** — Trident **Lite** upload does not run intake pdfplumber; **intake** path uses text layer only. **Blocks** “OCR for scanned PDFs” and **TEST 6**.
- **severity: CRITICAL — component: Trident 3.0 vs lock** — `Trident30OrderWorkspace`, `trident30_v1` POD/coding cover/Tebra **are real code paths** on the case page. If enabled in deploy, they **conflict** with “canonical generation = SWO + payer addendum only” for this phase. **Blocks** Layer B not overriding A.
- **severity: HIGH — component: Extraction** — `extractionFieldsFor` does not prove **per-page** traceability; first upload only. **Blocks** primary question (4).
- **severity: HIGH — component: Mixed patient / DOB conflict** — **Not** found in `trident-engine` or Lite. **Blocks** TEST 4, 5, 7.
- **severity: HIGH — component: Build** — `npm run build` **not** completed with success log in this audit. **Blocks** “build verified.”
- **severity: MEDIUM — component: Render string** — `services/shared/base.py` still matches `render.com` for DB host logic. **Blocks** “zero active render.com references” if interpreted strictly for code.

## 7. FAKE OR MISLEADING BEHAVIOR

- Trident **layout** and **metadata** claim “OCR” and “extract facts”; **Lite** path does not run **document OCR** on upload—only file storage + **heuristic** fields from **typed** patient data and **regex** procedure detection.
- `trident-engine` **source_page** is often `1` for all fields from first upload—**not** true page-level provenance.
- `READY_TO_GENERATE` can be shown while outputs are **.txt** drafts, not signed clinical documents.
- Trident **3.0** features (POD, Tebra, coding cover) **present** as if operational; DocuSign is **stubbed** in code—**not** production signature.
- **Settings wiki** and **exec/EDI** surfaces describe **full** billing/837P flows as if product—**not** excised from repository.

## 8. LEGACY POSEIDON RESIDUE

(Still present in tree; not removed)

- `frontend/src/components/edi/EdiCommandSurface.tsx` — 837P, remittance, denials
- `frontend/src/lib/edi-api.ts`, `frontend/src/app/api/edi/route.ts`
- `frontend/src/components/patient/ClaimActions.tsx` — 837P submit
- `frontend/src/app/patients/[patientId]/page.tsx` — CMS-1500, chart document model
- `frontend/src/components/executive/RevenueCommandSurface.tsx` — CMS-1500, POD labels
- `frontend/src/app/settings/wiki/page.tsx` — 837P, EDI, Stedi, Availity
- `frontend/src/app/api/fax/**`, `api/denials/**`, `api/exec/**`, `api/integrations/availity/**`, `api/patients/**`, `api/orders/**` (broad)
- `services/lite/trident30_v1.py`, `Trident30OrderWorkspace.tsx` — POD, Tebra, coding cover (Trident 3.0)
- `frontend/src/app/admin/**` — multiple admin pages in filesystem

## 9. EXACT NEXT FIXES

1. **Boot** DO compose stack (or local `docker compose up`) and re-run this audit with **captured** `curl` and **one** PDF upload through `/trident/cases` with internal API key.
2. **Feature flag** `TRIDENT_PHASE_A_ONLY`: **404** or disable registration of **all** non-Trident API routes and **remove** `Trident30OrderWorkspace` from default case page, or guard behind explicit opt-in.
3. **Delete or move to archive branch** EDI, exec claim, patient chart CMS-1500, executive revenue, wiki 837P pages—or **strip** from Next `app/` build with env.
4. Implement **real** matrix: mixed-patient + DOB conflict **blockers** in `trident-engine` and/or Lite API, with tests.
5. Either **wire** Trident upload to **intake** parse for PDFs, or add **OCR** (e.g. tesseract) for empty text; until then, **drop “OCR”** from product copy or mark **text-layer only**.
6. Run `npm run build` and `pytest` **in CI**; fail PRs if `audit_no_render_left` regresses.
7. Remove `render.com` from `base.py` host check or replace with allowlist that does not name Render (e.g. env-only list).

## 10. MANUAL QA STEPS

1. `docker compose up` (or `do_prod` script) on a clean DO droplet per `STATUS.md`.
2. `curl` dashboard `/api/health` and Lite `/health`.
3. Log in; confirm **only** `/trident/*` and `/login` are needed for the product; hit `/api/edi` and expect **404** if Layer A locked.
4. Create case; upload text-layer PDF; upload scanned PDF; record whether extraction populates.
5. Trigger SWO and transmittal generate; open files under Lite `data/lite_files/.../generated/`.
6. Attempt EDI and patient chart URLs **directly**; document whether still 200.
7. Re-run `bash scripts/audit_no_render_left.sh`.

## 11. BOTTOM LINE

**No.** You **cannot** assert that today, from this codebase alone, you can **upload a patient PDF packet** and **reliably** get a **reviewable SWO + payer addendum** end to end **without** legacy clutter, **without** claim-generation paths still present in the **monorepo**, and **without** Trident 3.0 **POD/Tebra/coding-cover** **competing** with the narrow lock—**and** you **cannot** prove it **in this run** because **no server was running** and **no** PDF was exercised through a live stack. **Render** is **not** the documented deploy target; **one** `render.com` string remains in **Python** DB code; **DO+compose** is **documented** but **not** verified booted here.
