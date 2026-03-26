# Availity Integration Service

Standalone Node.js / Express service that connects the Poseidon platform to
Availity for **eligibility verification** and **prior authorization**.

## Architecture

```
Frontend (Next.js)
  │
  ▼
/admin/integrations/availity   ← admin test page
  │
  ▼  (HTTP)
services/availity (Express :8004)
  ├── POST /api/integrations/availity/eligibility
  ├── POST /api/integrations/availity/prior-auth
  ├── GET  /api/integrations/availity/prior-auth/:authId
  └── GET  /api/integrations/availity/health
  │
  ├── Token Cache (in-memory, auto-refresh)
  ├── Audit Logger → PostgreSQL (availity_audit_logs)
  └── Prisma ORM  → PostgreSQL
  │
  ▼  (HTTPS)
Availity API (tst.api.availity.com)
  ├── POST /v1/token                   ← OAuth2 client credentials
  ├── POST /v1/coverages/eligibility   ← 270/271
  ├── POST /v1/authorizations          ← submit prior auth
  └── GET  /v1/authorizations/:id      ← poll status
```

## Quick Start

```bash
cd services/availity
cp .env.example .env          # fill in real credentials
npm install
npx prisma migrate dev        # create DB tables
npm run dev                   # starts on :8004
```

## HIPAA / Security Notes

- All Availity calls are **server-side only** — no secrets reach the browser.
- Every outbound call is written to `availity_audit_logs` with redacted payloads.
- Bearer tokens and client secrets are stripped from all log output.
- Input validated with Zod before any external call.
- Rate-limited at 30 req/min per IP on integration endpoints.

## Database Tables

| Table                          | Purpose                              |
|--------------------------------|--------------------------------------|
| `availity_cases`               | Patient-level work unit              |
| `availity_eligibility_checks`  | Each eligibility 270/271 transaction |
| `availity_prior_auth_requests` | Prior auth submissions + polling     |
| `availity_audit_logs`          | Full audit trail of every API call   |

## Testing

```bash
npm test              # runs vitest
npm run test:watch    # watch mode
```

## Environment Variables

See [.env.example](.env.example) for the full list. Key variables:

| Variable                    | Required | Description                          |
|-----------------------------|----------|--------------------------------------|
| `AVAILITY_BASE_URL`         | Yes      | Base URL for Availity API            |
| `AVAILITY_TOKEN_URL`        | Yes      | OAuth2 token endpoint                |
| `AVAILITY_CLIENT_ID`        | Yes      | OAuth2 client ID                     |
| `AVAILITY_CLIENT_SECRET`    | Yes      | OAuth2 client secret                 |
| `AVAILITY_SCOPE`            | No       | Space-separated OAuth scopes         |
| `AVAILITY_ELIGIBILITY_PATH` | No       | Defaults to `/v1/coverages/eligibility` |
| `AVAILITY_PRIOR_AUTH_PATH`  | No       | Defaults to `/v1/authorizations`     |
| `AVAILITY_TIMEOUT_MS`       | No       | Request timeout (default 30000)      |
| `DATABASE_URL`              | Yes      | PostgreSQL connection string         |

## Endpoint Details

### `POST /api/integrations/availity/eligibility`

Accepts patient + payer info, creates or reuses a Case, calls Availity, and
returns a normalized response.

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "dob": "1990-01-15",
  "memberId": "MEM123456",
  "payerId": "AETNA"
}
```

**Response:**
```json
{
  "caseId": "uuid",
  "checkId": "uuid",
  "success": true,
  "coverageActive": true,
  "payerName": "Aetna",
  "memberId": "MEM123456",
  "planName": "Gold PPO",
  "deductible": 1500,
  "deductibleRemaining": 800,
  "authRequired": false,
  "rawResponse": { ... }
}
```

### `GET /api/integrations/availity/health`

Returns connection status without exposing secrets.
