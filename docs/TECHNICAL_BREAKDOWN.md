# POSEIDON — Senior Project Engineer Technical Breakdown

**What we built and why it’s different from what’s available.**

---

## 1. What We Built (System View)

### 1.1 Architecture

- **Single codebase, four application services + one reverse proxy:**
  - **Core (8001):** Auth, patients, orders, denials, payment outcomes, KPIs/trends, document refs (SWO, CMS-1500, POD), **Availity eligibility (270/271) and billing (837/997)**, patient-record and PDF placeholder.
  - **Trident (8002):** Denial-risk scoring, payer rules (19 payers), optimize, train, model status; uses historical/corpus data and appeals intelligence.
  - **Intake (8003):** EOB PDF/835 EDI parsing, batch CSV, denial-file and appeal upload, data inventory; writes to `./data` and pushes events to Redis.
  - **ML (8004):** Training store, denial-pattern analysis (CARC, payer, HCPCS, category), reimbursement estimate, weights recompute; consumes Redis queues and file drops.
- **Shared state:** Postgres (single DB, org-scoped), Redis (pub/sub + queues), MinIO (object storage). No Google Sheets; no external spreadsheet dependency.
- **Front-end:** Dashboard + Rep Kanban (responsive, status drag-and-drop). Served behind nginx with `/api`, `/trident-api`, `/intake-api`, `/ml-api` proxied to the four services.
- **Deployment:** **Docker Compose** at the repo root. Postgres, Redis, MinIO, all app services, and nginx ship together; secrets come from `.env` on the host. Optional external DB/Redis URLs are supported via the same variables.

### 1.2 Data Model (Why It’s Structured This Way)

- **Multi-tenant from day one:** `org_id` on users, patients, orders, denials, outcomes, audit_log. All queries scoped by org; no cross-tenant data leak.
- **Single source of truth:** Orders carry status, denial summary (category, amount, date), payment summary (paid_amount, payment_date), Trident outputs (denial_risk_score, risk_tier, trident_flags), and document refs (swo_document_id, cms1500_document_id, pod_document_id). One row = one order’s full lifecycle for reporting and UI.
- **RCM-specific entities:** Payers table (timely filing, CMN/prior-auth rules, baseline denial rate); denials (CARC/RARC, category, appeal_deadline, appeal_status); payment_outcomes (adjustment_codes, eob_reference); ml_training_records (source, ingested_at) for learning loop.
- **Audit and workflow:** `audit_log` (who, what, resource, when, IP); `workflow_events` (event_type, payload). Built for compliance and traceability, not bolted on later.

### 1.3 Integrations (What’s Wired, Not Slideware)

- **Availity (eligibility + billing):**
  - OAuth2 client-credentials; token cached; same token used for 270 and 837.
  - **Eligibility:** Raw 270 POST; 270 built from patient/order; “simple” JSON (member_id, payer, name, DOB) → 270 → 271 with **parsed summary** (eligible, coverage_segments, errors). No need to handle X12 in the UI.
  - **Billing:** Raw 837 POST; **837 P built from order + patient** (one-click submit); 997 response parsed (accepted, transaction count). 835 parser available for ERA.
- **Intake:** Real EOB/835 parsing (CLP, CAS, SVC, NM1, DMG, etc.); batch CSV with HCPCS/ICD-10 validation; files written under `./data` and events pushed to Redis for downstream (Trident/ML).
- **Trident:** Subscribes to `orders.created`; scores and writes back denial_risk_score/risk_tier/flags. 19 payer rule sets (CMN, prior auth, modifiers, baseline denial rate) drive behavior.

### 1.4 Security and Compliance (Implemented, Not Checklist Theater)

- **Auth:** JWT, role-based access (admin, billing, intake, rep, executive, system). Passwords: **bcrypt** (cost 12) with SHA256 fallback for legacy hashes.
- **Audit:** Every sensitive action (login, user create, patient/order/denial/outcome create) writes to `audit_log` with org_id, user_id, action, resource, resource_id, IP. No PHI in audit rows.
- **PHI:** `PHI_IN_LOGS` default false; app logs use IDs/org only. Nginx: security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy); TLS-ready server block and HSTS comment; rate limiting (API vs upload).
- **Docs:** OpenAPI disabled in production. CORS restricted to dashboard origin.

---

## 2. Why This Is Different From What’s Available

### 2.1 Versus Generic EHR/EMR

- **RCM-first, not charting-first.** The core entity is the **order** (and its payer, HCPCS, auth, status, denial, payment), not the encounter note. Demographics and diagnoses exist to support eligibility, claims, and denial analysis. That’s the inverse of most EMRs.
- **DME/CPAP and 19 payers out of the box.** Trident has explicit rules (CMN, prior auth lists, modifiers, timely filing, baseline denial rates) for Medicare DMERC, UHC, Aetna, BCBS, Cigna, Humana, Medicaid, Anthem, etc. You’re not configuring a generic “claim engine” from zero.
- **Denial and payment are first-class.** Denials have CARC/RARC, category, appeal_deadline, appeal_status; payment_outcomes have adjustment_codes and eob_reference. KPIs and trends are computed from this data. ML trains on it. That’s not an afterthought module.

### 2.2 Versus Standalone RCM / Clearinghouse-Only

- **One platform: CRM + worklist + patient record + eligibility + claims + denial ML.** Rep Kanban, patient record (with SWO, CMS-1500, POD refs), and “full record” PDF path live in the same app as Core. Eligibility and billing go through the same API and DB. You don’t glue a separate CRM, a separate EMR, and a clearinghouse; you have one org-scoped data model and one place to enforce roles and audit.
- **Eligibility and billing are API-native, not “export to clearinghouse UI.”** You can call `/eligibility/check-simple` with JSON and get back a parsed 271 summary. You can call `/billing/submit-claim-from-order` with an order_id and get a 997 summary. The 270/837 are generated and sent by the platform; the UI (or an integration) doesn’t leave the product to do those steps elsewhere.
- **Learning loop is built in.** Denials and outcomes are written to Postgres and published to Redis; ML and Trident consume them. Training store, pattern analysis (CARC, payer, HCPCS, category), and reimbursement estimate live in the same deployment. You’re not sending data to a third-party “AI” black box; the data stays in your stack and the models run in your ML service.

### 2.3 Versus “We Use Availity” (Or Any Single Clearinghouse)

- **We don’t just “integrate” Availity; we own the transaction shape.** We build 270 and 837 P from our patient/order model; we parse 271, 997, and 835 for the UI and for downstream logic. So we can add another clearinghouse or payer-direct later without redoing the product: same internal representation, different outbound adapter.
- **Eligibility and billing are both covered.** Many products do eligibility only, or billing only, or hand off to a separate tool. Here, one auth, one token, one API surface for both, with simple and “from-order” flows so reps don’t touch X12.

### 2.4 Versus “We Have ML”

- **ML is tied to your data and your workflow.** Training records come from denials and outcomes you record, from EOB/835 intake, and from batch uploads. Pattern analysis is payer- and HCPCS-specific. Trident scores at order creation and writes back to the order row. So “ML” isn’t a separate dashboard; it’s denial risk on the order, optimization hints, and pattern APIs that the same app (or a sibling service) can use.
- **No PHI leaves the system for “AI.”** Model inputs and training data stay in your DB, Redis, and file store. That matters for HIPAA and for contracts.

### 2.5 Versus “We’re HIPAA Ready”

- **We implemented concrete controls.** Bcrypt, audit_log on sensitive actions, PHI_IN_LOGS off, security headers, TLS-ready config, rate limiting. The schema and code support “who did what, when” and “no PHI in logs” without a later retrofit. You still need BAs, policies, and TLS in production, but the system is built to support them.

### 2.6 Versus “One Monolith” or “Hundred Microservices”

- **Four services with clear boundaries.** Core = workflow and API; Trident = scoring and rules; Intake = parsing and ingest; ML = training and patterns. Shared base (config, DB pool, Redis, logging), one Compose file. You can scale or replace a service without rewriting the rest. It’s not a 50-service mesh, and it’s not one giant app where RCM, ML, and intake are tangled together.

---

## 3. One-Paragraph Summary (Senior Engineer Pitch)

POSEIDON is an **RCM-first, DME-focused platform** with a single multi-tenant Postgres model, four application services (Core, Trident, Intake, ML), and **native Availity eligibility and billing**: we generate and submit 270/837 and parse 271/997/835, with “simple” and “from-order” flows so the UI never touches X12. Denial and payment are first-class; Trident scores orders and maintains 19 payer rule sets; ML trains on your denials and outcomes and exposes pattern and reimbursement APIs. All data stays in your stack; audit and PHI controls are built in. That combination—**unified CRM + patient record + eligibility + billing + denial ML in one deployable stack, with one data model and one API**—is what makes it different from generic EMRs, clearinghouse-only tools, and black-box “AI” RCM add-ons.
