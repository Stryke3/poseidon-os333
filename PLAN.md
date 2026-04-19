# POSEIDON Hardening + Cutover Sprint — PLAN.md

**Generated:** 2026-04-18
**Branch:** `cursor/compose-deployment-docs-db-hardening`
**Authority:** Principal Platform Engineer sprint, scope per prompt `Mission: full hardening + cutover`.

Every line below is grounded in a file that exists in this repo as of today. Inferences are marked `[INFERENCE]`.

---

## 1. What will change

### 1.1 Deployment target (Phase 1–2)
- **Canonical runtime becomes DigitalOcean droplet + `docker-compose.yml` + `nginx/nginx.conf` only.** Evidence: `PRODUCTION_HARDENING.md`, `docker-compose.yml`.
- `firebase.json` (root, hosting SPA rewrite) is removed — it conflicts with the compose-only production target and is not referenced by any runtime code.
- `vercel.json` at repo root and `frontend/vercel.json` are marked as **local-dev-only** in docs; they are kept because `next dev` may still be used locally but are not a production path.
- `scripts/audit_no_render_pointers.sh` is preserved for DNS-level checks, but a new stricter repo-level audit is added: `scripts/audit_no_render_left.sh`.
- A single "do it all" cutover entrypoint is added: `scripts/do_prod_cutover_do_only.sh`.

### 1.2 Security baseline (Phase 3)
- `.gitignore` gets `.claude/` and `frontend/.env.production*` + `frontend/.env.development*` to stop local credential leakage routes.
- New `docs/SECRET_ROTATION_RUNBOOK.md` with exact rotation procedure per secret class.
- `scripts/validate_production_env.sh` expanded to cover: DB URL, Redis URL, MinIO, JWT, NextAuth, Trident learning flags, Intake parsing thresholds, EDI safety flags, `POSEIDON_DATABASE_URL`, `INTERNAL_API_KEY`, `AVAILITY_SFTP_*` when `SUBMISSION_METHOD=availity_sftp`.
- `services/shared/base.py` startup guard already refuses placeholder values for `ENVIRONMENT=production`; we add an explicit check for **EDI test-indicator vs environment** so `ISA_TEST_INDICATOR=P` + `EDI_DRY_RUN=false` + live Stedi key is a three-finger salute rather than a default.
- `.env.template` is updated to include every variable that services actually read (`POSEIDON_DATABASE_URL`, `MATIA_*`, `INTAKE_OCR_CONFIDENCE_THRESHOLD`, `ALLOWED_STORAGE_DOWNLOAD_HOSTS`, `POSEIDON_ENFORCE_NO_LOCALHOST`, `SENTRY_DSN`, `SERVICE_COMMIT`).

### 1.3 Intake + patient entry (Phase 4)
- A new canonical intake helper module in Core centralizes audit and review-queue semantics. Files touched: `services/core/main.py` (extended, not rewritten), plus new `services/core/intake_pipeline_audit.py` [INFERENCE: Core imports are tight; adding a sibling module is the least-risky change].
- Audit log rows are written for: **patient create/update, order create, order status change, order assign, order fulfillment update, billing submit-claim, intake batch import, intake document parsed, review-item created, fax inbound**. Today most of those do not appear in `audit_log`.
- A new SQL migration `017_intake_review_queue.sql` formalizes an `intake_review_queue` table + indexes and adds a `source_fingerprint` column on `orders` for idempotency.
- Low-confidence OCR (`INTAKE_OCR_CONFIDENCE_THRESHOLD`) now routes to the review queue explicitly; the current silent `intake_incomplete` flag remains but the review row is mandatory.

### 1.4 Trident learning from history (Phase 5)
- New migration `018_trident_learning_aggregates.sql` adding:
  - `trident_learned_aggregates` (versioned per-run aggregate rows, keyed by `version_id` + feature combo).
  - `trident_history_bootstrap_runs` (ledger of bootstrap runs, idempotent by run id).
- New `scripts/bootstrap_trident_from_history.py`:
  - Reads from `payment_outcomes`, `denials`, `appeals`, `claim_submissions`, `remittance_claims`, `remittance_adjustments`, `orders`, `eligibility_checks`, `auth_requests` (verified tables from `scripts/init.sql`).
  - Writes versioned aggregates into `trident_learned_aggregates`.
  - Refreshes `learned_rates` via Trident's existing `_refresh_learned_rates` contract but expands it to include physician/site.
  - Idempotent, resumable, chunked, logged to `trident_history_bootstrap_runs`.
- Trident `_trident_score` gets a secondary read from `trident_learned_aggregates` and returns `{rule_based, learned_adjustment, confidence, features_used}` in scoring output.
- New endpoint `POST /api/v1/trident/bootstrap-history` fronts the same pipeline for ops.

### 1.5 Migration safety (Phase 6)
- Numbering collision `016_operator_adam_strykefox.sql` is renamed **to `017_operator_adam_strykefox.sql` → then to a safe slot** after the new migrations, so ordering becomes strictly monotonic. Final order: `001..016_stedi_835_import_ids, 017_intake_review_queue, 018_trident_learning_aggregates, 019_operator_adam_strykefox`.
- `scripts/run_production_migrations.sh` is rewritten to **glob-and-sort** from `scripts/migrations/` so humans cannot forget to add a file.
- `docs/SCHEMA_OWNERSHIP.md` codifies who owns what table (psycopg services vs. Prisma) and how the Availity Node service and Core must not fight over denial state.

### 1.6 Observability (Phase 7)
- `services/shared/base.py` gets a `SENTRY_DSN` hook (opt-in) and a **request-id middleware** that attaches `X-Request-ID` to every response and to every `logger` record using contextvars.
- `docs/OPERATIONS_STATUS.md` becomes the one-page ops map: endpoints + what "red" means + where to look when intake/Trident/patient create fails.

### 1.7 Targeted Core stabilization (Phase 8)
- **Not rewriting `services/core/main.py` (9,329 LOC)** in this sprint. That would be destabilizing.
- Instead: (a) audit-coverage gaps fixed in place with narrow edits; (b) a new module `services/core/intake_pipeline_audit.py` encapsulates the repeat audit-log/review-queue calls so subsequent extraction is mechanical.

---

## 2. What is dangerous

- **Renaming migration 016** in a DB that has already executed `016_operator_adam_strykefox.sql` would re-run it. The rewritten runner uses a server-side `schema_version` table check and a file-level idempotency prefix (`CREATE TABLE IF NOT EXISTS …`, `DO $$ … IF NOT EXISTS`) but operators must confirm on each target whether 016 has already been applied before re-running. Runbook covers this.
- **Bootstrap of Trident from history** will issue aggregate reads over up to 30,000 rows in `payment_outcomes` + related tables. It's chunked to 5,000 rows per page and is idempotent per `run_id`, but operators must set `TRIDENT_BOOTSTRAP_CHUNK_SIZE` and watch DB CPU on the initial run.
- **Adding Sentry hook** without a DSN does nothing, but if a DSN is misconfigured it can crash service startup. We wrap `sentry_sdk.init` in a `try/except` that logs and continues.
- **Removing `firebase.json`** is safe from a runtime perspective (no code references it) but if anyone has a Firebase Hosting site still pointing at the repo, it will stop being rebuilt. This is intended.
- **Audit log expansion** increases write volume on hot paths (`/orders/{id}/status`). New writes are one `INSERT` per action and use the same connection as the surrounding transaction. `[INFERENCE]` overhead is negligible vs. claim submission paths.
- **EDI test-indicator guard** now refuses `ISA_TEST_INDICATOR=P` + `EDI_DRY_RUN=false` + unset `STEDI_API_KEY` at process startup. This will prevent EDI from starting in a misconfigured production environment — that is intentional and is the safer default.

---

## 3. What will be removed

| Artifact | Why |
|---|---|
| `firebase.json` | Conflicts with compose-only production; not referenced by runtime. |
| `.github/workflows/` from `.gitignore` | The CI file must be committed; removing this line is how that happens. |
| Any Render-specific deployment assumptions in docs | Phase 1 requirement. |
| Implicit default `ISA_TEST_INDICATOR=P` in EDI compose block for non-production `ENVIRONMENT` | Replaced with an explicit production-only default so test envs stay in test. |

Not removed this sprint (deliberately kept):
- `scripts/do_big_bang_cutover.sh` — kept; referenced by runbook; now complemented by the DO-only runner.
- `scripts/audit_no_render_pointers.sh` — kept; DNS-level audit is still useful; reworded to DO-target context.
- `POSEIDON_GROUND_TRUTH.md` — kept as historical archive; lightly appended with a note that Phase 1 has completed.
- `POSEIDON_ALL_FOUR.md`, `POSEIDON_FIX.md` — kept for now (stale but harmless); a separate cleanup pass can retire them.

---

## 4. What will be migrated

| From | To |
|---|---|
| Implicit migration list in `run_production_migrations.sh` | Glob-and-sort from `scripts/migrations/*.sql` |
| `016_operator_adam_strykefox.sql` (collision) | `019_operator_adam_strykefox.sql` |
| Unstructured low-confidence intake | `intake_review_queue` table, explicit state |
| Implicit denial-row ownership between Core + Availity-Node | Documented in `docs/SCHEMA_OWNERSHIP.md` |
| Scattered secret docs | `docs/SECRET_ROTATION_RUNBOOK.md` |
| No request correlation | `X-Request-ID` middleware in `services/shared/base.py` |
| `INTAKE_OCR_CONFIDENCE_THRESHOLD` only in `.env.template` | Validated in `scripts/validate_production_env.sh` |

---

## 5. Success criteria mapping

| Criterion | Where satisfied |
|---|---|
| 1. Single deployment target: DO + compose + nginx | Phases 1, 2 |
| 2. No Render references in code/envs/docs/scripts | Phase 1; `scripts/audit_no_render_left.sh` enforces |
| 3. Live intake workflow | Phase 4; `017_intake_review_queue.sql` + audit expansion |
| 4. Trident bootstrapped from historical DB | Phase 5; `bootstrap_trident_from_history.py` + `018_trident_learning_aggregates.sql` + scoring integration |
| 5. E2E healthchecks | Phase 2; `do_prod_cutover_do_only.sh` |
| 6. Audit log coverage on patient create, order create, parse ingest, status, claim submission | Phase 4 + Phase 8 narrow edits |
| 7. Clear cutover runbook | `PRODUCTION_HARDENING.md` + `OPERATIONS_STATUS.md` |

---

*This plan is executed immediately in the same sprint. See final debrief for exact files changed and residual blockers.*
