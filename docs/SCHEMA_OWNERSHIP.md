# POSEIDON — Schema Ownership

**Scope:** every table that lives in the single POSEIDON Postgres database.
**Audience:** engineers who are about to write a migration, engineers who are
about to write a service that reads/writes tables, on-call engineers during
schema incidents.

A single Postgres database is shared between two migration systems:

- **Raw SQL migrations** in `scripts/migrations/*.sql` — owned by the Python
  services (Core, Trident, Intake, ML) and applied by
  `scripts/run_production_migrations.sh`.
- **Prisma migrations** in `services/availity/prisma/migrations/` — owned by
  the Node/TypeScript Availity microservice and applied by the Availity
  service on deploy.

Each migration system is authoritative for a disjoint set of tables. Do not
cross the line. If you need the other system to alter a table, coordinate
across repos/services.

---

## 1. Raw SQL (Python services) — `scripts/migrations/`

These tables are owned by the psycopg-based services. Core is the primary
writer for most of them.

| Table | Writer(s) | Reader(s) | Notes |
|---|---|---|---|
| `organizations` | Core | all | Seeded via `scripts/init.sql` |
| `users` | Core | all | Bcrypt password hash column |
| `payers` | Core, Trident | all | Org-scoped; payer reference data |
| `patients` | Core | Core, Trident, Intake, ML | PHI |
| `patient_insurances` | Core | Core, Intake | |
| `physicians` | Core | Core, Trident, Intake | |
| `orders` | Core | Core, Trident, Intake, ML, EDI | Primary lifecycle row |
| `order_diagnoses` | Core | Core, Trident | |
| `order_line_items` | Core | Core, EDI | |
| `order_documents` | Core | Core, Intake, EDI | MinIO refs |
| `eligibility_checks` | Core, Intake | Core, Trident, ML | 270/271 history |
| `auth_requests` | Core | Core, Availity-Node (READ-ONLY reconciliation) | See §3 |
| `payer_auth_requirements` | Core, Trident | Core, Trident | |
| `eob_claims` | Core, Intake | Core, ML | 835 parse |
| `eob_line_items` | Core, Intake | Core, ML | |
| `payment_outcomes` | Core, Intake, Trident | **everyone, including bootstrap aggregates** | The ML corpus root |
| `eob_worklist` | Core, Intake | Core | |
| `denials` | Core | Core, Trident, ML, Availity-Node (READ-ONLY) | See §3 |
| `appeals` | Core | Core, Trident, Availity-Node (READ-ONLY) | See §3 |
| `trident_rules` | Trident | Trident, Core | |
| `trident_training_ledger` | Trident | Trident | |
| `learned_rates` | Trident | Trident, Core | Refreshed by bootstrap + continuous sync |
| `trident_learned_aggregates` | **Bootstrap pipeline ONLY** | Trident | See migration 018 |
| `trident_history_bootstrap_runs` | Bootstrap pipeline | Trident, ops | |
| `timely_filing_windows` | Core | Trident | |
| `cmn_tracker` | Core | Core | |
| `shipments` | Core | Core | |
| `workflow_events` | Core, Intake | Core | Event store |
| `audit_log` | **every service** | ops, Core | PHI-safe |
| `fax_log` | Core | Core | Sinch inbound + outbound |
| `notifications` | Core | Core | |
| `communications_messages` | Core | Core | In-app feed |
| `patient_notes` | Core | Core | PHI |
| `claim_submissions` | Core, EDI | Core, EDI | One-per-order invariant via migration 012 |
| `remittance_batches` | EDI | EDI, Core | 835 import |
| `remittance_claims` | EDI | EDI, Core | |
| `remittance_adjustments` | EDI | EDI | |
| `remittance_service_lines` | EDI | EDI | |
| `stedi_835_import_ids` | EDI | EDI | |
| `edi_audit_log` | EDI | EDI, ops | |
| `schema_version` | Migration runner | Core startup | Startup asserts `version >= 14` |
| `password_reset_tokens` | Core | Core | |
| `intake_review_queue` | Core, Intake | Core, Intake, ops | Introduced by migration 017 |

---

## 2. Prisma (Node Availity service) — `services/availity/prisma/migrations/`

These tables are owned exclusively by the Node Availity service. **No psycopg
service should DDL them.** The Prisma schema and migration history at
`services/availity/prisma/schema.prisma` is authoritative.

| Table | Prisma model | Writer(s) | Reader(s) |
|---|---|---|---|
| `availity_cases` | `AvailityCase` | Availity-Node | Availity-Node |
| `availity_eligibility_checks` | `AvailityEligibilityCheck` | Availity-Node | Availity-Node, dashboard BFF |
| `availity_prior_auth_requests` | `AvailityPriorAuthRequest` | Availity-Node | Availity-Node |
| `availity_prior_auth_packets` | `AvailityPriorAuthPacket` | Availity-Node | Availity-Node |
| `availity_prior_auth_documents` | `AvailityPriorAuthDocument` | Availity-Node | Availity-Node |
| `availity_audit_logs` | `AvailityAuditLog` | Availity-Node | Availity-Node, ops |
| `payer_behavior_rules` | `PayerBehaviorRule` | Availity-Node | Availity-Node, dashboard BFF |
| `authorization_outcomes` | `AuthorizationOutcome` | Availity-Node | Availity-Node |
| `payer_manuals` | `PayerManual` | Availity-Node | Availity-Node |
| `manual_requirements` | `ManualRequirement` | Availity-Node | Availity-Node |
| `learned_rule_suggestions` | `LearnedRuleSuggestion` | Availity-Node | Availity-Node |
| `playbook_performance` | `PlaybookPerformance` | Availity-Node | Availity-Node |
| `governance_recommendations` | `GovernanceRecommendation` | Availity-Node | Availity-Node |
| `governance_drafts` | `GovernanceDraft` | Availity-Node | Availity-Node |
| `governance_decisions` | `GovernanceDecision` | Availity-Node | Availity-Node |
| `payer_playbooks` | `PayerPlaybook` | Availity-Node | Availity-Node, dashboard BFF |
| `playbook_executions` | `PlaybookExecution` | Availity-Node | Availity-Node |
| `payer_score_snapshots` | `PayerScoreSnapshot` | Availity-Node | Availity-Node |
| `payer_intelligence_audit_logs` | `PayerIntelligenceAuditLog` | Availity-Node | Availity-Node |
| `pre_submit_validation_results` | `PreSubmitValidationResult` | Availity-Node | Availity-Node |
| `denial_events` | `DenialEvent` | Availity-Node | Availity-Node, Core (READ-ONLY reconciliation) |
| `denial_classification_snapshots` | `DenialClassificationSnapshot` | Availity-Node | Availity-Node |
| `appeal_packets` | `AppealPacket` | Availity-Node | Availity-Node |
| `appeal_outcomes` | `AppealOutcome` | Availity-Node | Availity-Node, Core (READ-ONLY reconciliation) |
| `_prisma_migrations` | internal | Prisma | Prisma |

---

## 3. Denial + appeal ownership (the one thing to get right)

Both systems have denial-shaped tables. This is the single most dangerous
source of dual-write risk. The rule is:

- **`denials` (Python raw SQL) is the authority** for denial state that the
  rest of the Python stack (Core, Trident, ML) scores, appeals, or reports
  against. Core is the only writer.
- **`denial_events` (Prisma) is the authority** for the Availity service's
  automation-engine event stream — payer-sourced denial events that the
  Availity service detects, classifies, or auto-acts on.
- Crossing over is READ-ONLY:
  - Core may read `denial_events` for reconciliation but must not write.
  - Availity-Node may read `denials` / `appeals` for reconciliation but must
    not write.
- A reconciliation job **should** be added that compares the two streams and
  flags drift; that job does not exist yet and is tracked as residual risk.

---

## 4. Migration rules

1. Every raw SQL migration must be idempotent:
   - `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
     `ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
     `INSERT … ON CONFLICT DO NOTHING`, `DO $$ IF NOT EXISTS … $$`.
2. Numbering is strictly monotonic: `NNN_short_snake.sql`. No two files share
   a prefix. `scripts/tests/test_migrations_ordering.py` enforces this.
3. Every new raw migration must bump `schema_version` so Core startup knows
   about it.
4. Prisma migrations must never introduce a table that collides with a raw
   SQL table's name.
5. Dropping a column across the boundary (e.g. Core drops a column that
   Availity-Node reads) requires coordination across services.

---

## 5. Apply order on a fresh DB

```bash
bash scripts/run_production_migrations.sh           # raw SQL (Core-side)
cd services/availity && npx prisma migrate deploy   # Prisma (Availity-Node)
```

---

## 6. How to ask "who owns this table?"

1. Look in `scripts/init.sql` — if it defines a `CREATE TABLE` for the name,
   it's a raw-SQL-owned table. See §1.
2. Look in `services/availity/prisma/schema.prisma` — if a `@@map("NAME")`
   decoration exists, it's Prisma-owned. See §2.
3. If both or neither have it, escalate — that is a schema-ownership bug, not
   a valid state.
