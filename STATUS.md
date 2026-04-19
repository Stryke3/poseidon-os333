# POSEIDON Status

Last updated: 2026-04-18 (hardening sprint)

## Deployment posture

- **Canonical production target: DigitalOcean droplet + docker compose + nginx.**
- Cutover scripts:
  - `scripts/do_prod_cutover_do_only.sh` — single-entrypoint DO cutover (preflight → build → migrate → up → healthcheck).
  - `scripts/do_big_bang_cutover.sh` — legacy droplet over ssh/rsync (kept; use new script in preference).
  - `scripts/audit_no_render_left.sh` — repo-level guard; fails if any tracked file regresses a Render pointer.
  - `scripts/audit_no_render_pointers.sh` — DNS/HTTP guard; run after DNS cutover to confirm external surface no longer resolves to legacy hosts.
- Production hardening runbook: `PRODUCTION_HARDENING.md`.
- Operator runbook: `docs/OPERATIONS_STATUS.md`.

## Current internal state (post-sprint)

- Compose defines 11 services (redis, minio, postgres, core, trident, intake, ml, edi, availity, dashboard, nginx). All have healthchecks and restart policies.
- Migration numbering collision resolved: legacy `016_operator_adam_strykefox.sql` renumbered; new migrations `017_intake_review_queue.sql` and `018_trident_learning_aggregates.sql` added.
- Trident historical bootstrap available via `scripts/bootstrap_trident_from_history.py` and `POST /api/v1/trident/bootstrap-history`.
- Intake low-confidence OCR lands in `intake_review_queue` with explicit state.
- Audit log coverage extended to patient create, order create, status change, assign, fulfillment, billing submit.
- Request-ID middleware and optional Sentry DSN wired into all Python services.

## Blockers to final live cutover

- Non-interactive SSH to the production droplet requires a key authorized on that host; `do_prod_cutover_do_only.sh` assumes the operator has `ssh` working. Fix: add the operator public key to the droplet or run the script from the droplet itself.
- **Neon production DB password + GitHub PAT rotation is required before flipping traffic.** See `docs/SECRET_ROTATION_RUNBOOK.md`.
- Real Availity OAuth + Stedi API key must be placed in `.env` before `EDI_DRY_RUN=false`. `scripts/validate_production_env.sh --strict` enforces.

## Historical note

Earlier deployment used a third-party managed host for some services. That target is no longer supported; `scripts/audit_no_render_left.sh` guards the repo against regressions.
