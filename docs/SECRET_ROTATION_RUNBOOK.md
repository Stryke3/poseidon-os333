# POSEIDON — Secret Rotation Runbook

**Audience:** on-call platform engineer.
**Scope:** every production secret consumed by any POSEIDON service.
**Cadence:** quarterly rotation minimum; immediately on exposure.

This runbook intentionally does not contain any secret values.

---

## Contents

1. [Emergency rotation sequence](#1-emergency-rotation-sequence)
2. [Per-secret procedures](#2-per-secret-procedures)
   1. [Postgres (Neon and bundled compose DB)](#21-postgres-neon-and-bundled-compose-db)
   2. [JWT / SECRET_KEY / NEXTAUTH_SECRET / POSEIDON_API_KEY / INTERNAL_API_KEY](#22-jwt--secret_key--nextauth_secret--poseidon_api_key--internal_api_key)
   3. [Redis password](#23-redis-password)
   4. [MinIO access + secret key](#24-minio-access--secret-key)
   5. [GitHub Personal Access Token](#25-github-personal-access-token)
   6. [Gmail OAuth (intake mailbox)](#26-gmail-oauth-intake-mailbox)
   7. [Anthropic / OpenAI API keys](#27-anthropic--openai-api-keys)
   8. [Availity REST + SFTP credentials](#28-availity-rest--sftp-credentials)
   9. [Stedi API key](#29-stedi-api-key)
   10. [Sinch Fax v3](#210-sinch-fax-v3)
   11. [Dropbox Sign (formerly HelloSign)](#211-dropbox-sign-formerly-hellosign)
3. [Verification after rotation](#3-verification-after-rotation)
4. [Exposure response](#4-exposure-response)

---

## 1. Emergency rotation sequence

If a secret has leaked to git history, a screenshot, a chat log, or an uninvited inbox:

1. Treat the secret as compromised.
2. Rotate in **this priority order** and do not skip steps:
   1. Postgres (if DB URL leaked — stops the bleeding)
   2. GitHub PAT (if a PAT leaked)
   3. JWT / SECRET_KEY (if any session-signing secret leaked — forces re-auth but is required)
   4. INTERNAL_API_KEY (service-to-service)
   5. NEXTAUTH_SECRET
   6. Every third-party API key referenced in `.env`
3. Update `.env` on the droplet (NEVER commit).
4. `docker compose up -d --force-recreate` to pick up new values.
5. Run `bash scripts/validate_production_env.sh` and `bash scripts/do_prod_cutover_do_only.sh` to confirm the stack still passes.
6. Post-mortem: file an incident note in `docs/OPERATIONS_STATUS.md` under "Recent incidents".

Evidence of exposure in this repo's history that MUST be rotated before any real traffic:

- **Neon production DB password** (committed 2026-03-26 in commit `877bbeb`, still present in `scripts/seed_real.js` and `scripts/seed_neon.js` on disk). Rotate.
- **GitHub Personal Access Token** (embedded in `.git/config` `origin` URL as of this audit). Rotate + remove from remote URL.
- Local `.env`, `frontend/.env.local`, and `.claude/settings.local.json` contain a live Anthropic key. `.claude/` is now gitignored; confirm nothing is staged.

---

## 2. Per-secret procedures

### 2.1 Postgres (Neon and bundled compose DB)

**Who uses it:** every Python service (`psycopg`), the Availity Node service (`@prisma/client`), host scripts (`psql` via `scripts/run_production_migrations.sh`), and `scripts/seed_neon.js` / `scripts/seed_real.js`.

**Variables:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`, `DATABASE_URL`, `POSEIDON_DATABASE_URL`.

Procedure — **Neon managed Postgres**:

1. Neon Console → Project → Roles → select role → **Reset password**.
2. Copy the new pooled connection string.
3. On the droplet, edit `/opt/poseidon/.env`:
   - `DATABASE_URL=postgresql://…/neondb?sslmode=require`
   - `POSEIDON_DATABASE_URL=` (same URL if you are using Neon in production; leave unset if using the bundled compose Postgres).
4. `docker compose up -d --force-recreate core trident intake ml edi availity dashboard`.
5. `bash scripts/run_production_migrations.sh` (will be a no-op on already-applied migrations).
6. Confirm `/ready` on every service.

Procedure — **bundled compose Postgres**:

1. Update `POSTGRES_PASSWORD` in `.env`. Because init SQL runs only on a fresh volume, rotating post-init requires:
   ```bash
   docker compose exec postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "ALTER USER ${POSTGRES_USER} PASSWORD 'NEW_VALUE';"
   ```
2. Update `.env` to match.
3. `docker compose restart core trident intake ml edi availity dashboard`.

**After rotating, replace the hardcoded URL in `scripts/seed_real.js` and `scripts/seed_neon.js`** (those files currently hold a literal; they should read from `DATABASE_URL` instead — enforced by Phase 3 of this sprint).

### 2.2 JWT / SECRET_KEY / NEXTAUTH_SECRET / POSEIDON_API_KEY / INTERNAL_API_KEY

**Who uses it:** Core (`JWT_SECRET`), shared base (`SECRET_KEY` fallback), NextAuth dashboard (`NEXTAUTH_SECRET`), service-to-service (`INTERNAL_API_KEY`), API gatekeeping (`POSEIDON_API_KEY`).

Procedure:

1. Generate new values:
   ```bash
   openssl rand -hex 32   # 64-char hex; min length enforced by validate_production_env.sh
   ```
2. Update `.env` on the droplet.
3. `docker compose up -d --force-recreate`.
4. **Rotating `JWT_SECRET` invalidates all live sessions** — expect operators to re-auth.
5. `bash scripts/validate_production_env.sh` must pass.

### 2.3 Redis password

**Who uses it:** every Python service (via `REDIS_URL`), Trident learning state, Intake polling state.

**Variables:** `REDIS_PASSWORD`, `REDIS_URL`, `POSEIDON_REDIS_PASSWORD`.

Procedure:

1. Generate `openssl rand -hex 32`.
2. Update `.env`: both `REDIS_PASSWORD` and `REDIS_URL` (URL contains password inline: `redis://:NEW@redis:6379/0`).
3. `docker compose up -d --force-recreate redis` (then the other services so they reconnect).
4. Verify `docker compose exec redis redis-cli -a "$REDIS_PASSWORD" ping` returns `PONG`.

### 2.4 MinIO access + secret key

**Who uses it:** Core (documents), Trident (models), Intake, ML. Browser downloads go through the Next.js BFF, which gates on `ALLOWED_STORAGE_DOWNLOAD_HOSTS`.

**Variables:** `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `POSEIDON_MINIO_ACCESS_KEY`, `POSEIDON_MINIO_SECRET_KEY`.

Procedure:

1. `docker compose exec minio mc alias set local http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"`.
2. Create a new credential pair via MinIO console or `mc admin user svcacct add`.
3. Update `.env`.
4. `docker compose up -d --force-recreate` and confirm service startup reads the new keys.
5. Revoke the old keys in MinIO.

### 2.5 GitHub Personal Access Token

**Where it lives today:** `.git/config` `[remote "origin"]` `url` on some clones contains `https://<user>:<PAT>@github.com/...` per the audit.

Procedure:

1. GitHub → Settings → Developer settings → Personal access tokens → **Revoke** the existing PAT.
2. Create a new fine-grained PAT scoped only to this repo with minimum permissions.
3. On each clone that had the PAT:
   ```bash
   git remote set-url origin https://github.com/Stryke3/poseidon-os333.git
   git config credential.helper osxkeychain      # or your preferred store
   ```
   Keep the PAT out of the URL itself.
4. `git pull` to confirm access; keychain will prompt for the new PAT once.

### 2.6 Gmail OAuth (intake mailbox)

**Variables:** `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`, `GMAIL_INTAKE_USER`.

Procedure:

1. Google Cloud Console → target project → **APIs & Services → Credentials**.
2. Reset client secret; regenerate OAuth consent for the refresh token (run the approved OAuth flow in a private-mode browser logged in as `patients@strykefox.com` or the chosen intake mailbox).
3. Update `.env`. Do NOT ever commit.
4. Restart `intake` + `core`.
5. Confirm `POST /ingest/email-intake/poll` returns a non-error payload.

### 2.7 Anthropic / OpenAI API keys

**Variables:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, plus the dashboard-facing `TRIDENT_DIGEST_*`.

Procedure:

1. Anthropic console → **Revoke** existing key, create new.
2. Update `.env`.
3. Restart `dashboard` and `availity` (they read these at startup for the LLM digest path).
4. Confirm `POST /api/trident` returns a non-error payload.

**Note:** the Anthropic key has been observed on disk in `.env`, `frontend/.env.local`, and `.claude/settings.local.json`. After rotation, delete the old value from all three locations and confirm `.claude/` is gitignored.

### 2.8 Availity REST + SFTP credentials

**Variables:** `AVAILITY_CLIENT_ID`, `AVAILITY_CLIENT_SECRET`, `AVAILITY_SFTP_USER`, `AVAILITY_SFTP_PASS`, `AVAILITY_CUSTOMER_ID`, `AVAILITY_SENDER_ID`, `AVAILITY_RECEIVER_ID`.

Procedure:

1. Availity partner portal → Applications → rotate client secret.
2. Availity support ticket for SFTP password rotation (use the submitter service account).
3. Update `.env`.
4. Restart `core`, `availity`, `edi`.
5. Confirm:
   - `POST /eligibility/check-simple` against Core returns a parsed 271.
   - `POST /api/integrations/availity/eligibility` against the Availity Node service returns `success: true`.
   - If `SUBMISSION_METHOD=availity_sftp`, confirm `services/edi/app/clients/availity_sftp.py` can log in (see `services/edi/tests/`).

### 2.9 Stedi API key

**Variables:** `STEDI_API_KEY`, `SUBMISSION_METHOD=stedi_api` (default).

Procedure:

1. Stedi console → API keys → revoke old, create new.
2. Update `.env`.
3. Keep `EDI_DRY_RUN=true` through the first test submission.
4. Restart `edi`.
5. Test with a known-good claim: `POST /submit/{order_id}` then `POST /poll-stedi-835`.

### 2.10 Sinch Fax v3

**Variables:** `SINCH_PROJECT_ID`, `SINCH_KEY_ID`, `SINCH_KEY_SECRET`, `SINCH_WEBHOOK_SECRET`, `SINCH_FROM_NUMBER`.

Procedure:

1. Sinch dashboard → Access keys → create a new key pair, delete the old one.
2. Update `.env`.
3. Restart `core` (Sinch webhook handler and outbound fax endpoint live in Core).
4. Verify `POST /fax/log` outbound and `POST /fax/inbound` webhook HMAC using the new secret.

### 2.11 Dropbox Sign (formerly HelloSign)

**Variables:** `DROPBOX_SIGN_API_KEY`, `DROPBOX_SIGN_WEBHOOK_SECRET`, `DROPBOX_SIGN_REQUEST_URL`.

Procedure:

1. Dropbox Sign console → Integrations → rotate API key and webhook signing secret.
2. Update `.env`.
3. Restart `core`.
4. Trigger a test SWO signature flow; confirm `POST /webhooks/dropbox-sign/swo` is accepted with the new HMAC.

---

## 3. Verification after rotation

Always run in this order on the droplet:

```bash
bash scripts/validate_production_env.sh
docker compose config -q
docker compose up -d --force-recreate
bash scripts/do_prod_cutover_do_only.sh   # full health probe
```

Check the audit log to confirm service-to-service calls are being made with the new `INTERNAL_API_KEY`:

```sql
SELECT created_at, action, resource, resource_id
FROM audit_log
WHERE created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 4. Exposure response

If a secret is exposed in git history (see `scripts/seed_real.js` for a live example):

1. Rotate (per Section 2).
2. Purge from history with BFG Repo-Cleaner **after** rotation:
   ```bash
   git clone --mirror git@github.com:Stryke3/poseidon-os333.git poseidon.git
   cd poseidon.git
   bfg --replace-text <(cat <<'EOF'
   OLD_VALUE_1==>REDACTED
   OLD_VALUE_2==>REDACTED
   EOF
   )
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   git push --force
   ```
3. Force every collaborator to re-clone (rebasing is not safe after history rewrites).
4. Open an incident entry in `docs/OPERATIONS_STATUS.md` noting: date, scope, rotation steps taken, confirmation of new credential functioning, confirmation of old credential non-functioning.
