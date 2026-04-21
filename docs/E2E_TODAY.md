# Local Compose — Login and Intake Upload (E2E)

This runbook matches the Docker Compose stack (`nginx` on port 80 → `dashboard` Next.js BFF → `core` / `intake`).

## Environment assumptions

- **Browser origin must match `NEXTAUTH_URL`.**  
  Example: if you open `http://dashboard.strykefox.com`, set `NEXTAUTH_URL=http://dashboard.strykefox.com` in `.env` (and map that host to `127.0.0.1` in `/etc/hosts`). If you use `http://localhost` only, set `NEXTAUTH_URL=http://localhost`. Mixing `localhost` and `127.0.0.1` with the wrong `NEXTAUTH_URL` breaks the session cookie and CSRF.
- **Dashboard (BFF) server-side URLs** (Compose defaults):  
  `POSEIDON_API_URL` / `CORE_API_URL` → `http://core:8001`, `INTAKE_API_URL` → `http://intake:8003`, `INTERNAL_API_KEY` set and aligned with Intake/Core.
- **`NEXTAUTH_SECRET`**: set in `.env` or rely on the Compose default for local dev (see `docker-compose.yml` `dashboard` service).

## Start the stack

From the repo root:

```bash
docker compose up -d --build
```

Wait until `poseidon_dashboard`, `poseidon_core`, `poseidon_intake`, and `poseidon_nginx` are healthy.

## Login (browser)

1. Open the dashboard at the **same origin** as `NEXTAUTH_URL` (through nginx), e.g. `http://dashboard.strykefox.com/` or `http://localhost/`.
2. Go to `/login`.
3. Sign in with a Core user (seeded operator credentials per `scripts/init.sql` if using the bundled DB).

**Expected:** Redirect to `/` (or `callbackUrl`) with a session; no `CredentialsSignin` error.

## Verify session (optional)

In the browser devtools, confirm cookies include `next-auth.session-token` (HTTP) or `__Secure-next-auth.session-token` (HTTPS).

## Authenticated upload (BFF)

Use the UI intake dropzone (posts to `POST /api/intake/upload`) or, with an **existing browser session**, reproduce:

- **PDF:** one `.pdf` with parseable patient content.  
- **CSV:** one `.csv` matching the intake column expectations.

**Expected JSON (success):** HTTP 200 with `status: "ok"`, `sourceFile`, `parsedRows`, `importResult`, etc.

**Failure (unauthenticated):** HTTP 500 with  
`{"error":"Live ingest requires an authenticated operator session."}` — fix `NEXTAUTH_URL` vs browser URL and sign in again.

## Intake path (reference)

`Browser` → `POST /api/intake/upload` (Next BFF) → `POST ${INTAKE_API_URL}/api/v1/intake/upload` → Core import when configured.

## Poseidon Lite (automated API E2E)

From repo root, with Postgres + `lite` running (`docker compose up -d postgres lite`):

```bash
./scripts/e2e_lite.sh
```

The script calls the Lite service on `http://127.0.0.1:8010` (override with `LITE_URL`). It picks up `INTERNAL_API_KEY` from the environment, or from the `poseidon_lite` container if you use Compose and the variable is not set locally (so it matches a custom `.env`).

**Expected:** exit code 0; creates a patient, uploads a file, generates SWO / transmittal / checklist / billing-summary, and verifies downloads.
