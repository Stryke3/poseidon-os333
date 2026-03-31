# Poseidon Production Secrets Checklist

This checklist defines required secret material for go-live.

## Platform Core
- `ENVIRONMENT=production`
- `NODE_ENV=production`
- `JWT_SECRET`
- `NEXTAUTH_SECRET`
- `POSEIDON_API_KEY`
- `INTERNAL_API_KEY`

## Datastores
- `DATABASE_URL` (preferred) or discrete Postgres credentials
- `POSTGRES_PASSWORD` (required when `DATABASE_URL` is not set)
- `REDIS_URL` (preferred) or discrete Redis credentials
- `REDIS_PASSWORD` (required when `REDIS_URL` is not set)

## Service Endpoints
- `POSEIDON_API_URL`
- `CORE_API_URL`
- `INTAKE_API_URL`
- `TRIDENT_API_URL`
- `ML_API_URL`
- `AVAILITY_SERVICE_URL`
- `NEXTAUTH_URL`
- `EDI_API_URL`

## Object Storage
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `MINIO_SECURE`

## Email / Notifications
- `PUBLIC_INQUIRY_TO`
- `GMAIL_INTAKE_USER`
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REFRESH_TOKEN`
- `SMTP_HOST` (+ `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS` when enabled)

## Fax / Messaging
- `SINCH_PROJECT_ID`
- `SINCH_KEY_ID`
- `SINCH_KEY_SECRET`

## EDI / Clearinghouse
- `SUBMISSION_METHOD` (`availity_sftp` or `stedi_api`)
- `AVAILITY_SFTP_USER` + `AVAILITY_SFTP_PASS` (when `SUBMISSION_METHOD=availity_sftp`)
- `STEDI_API_KEY` (when `SUBMISSION_METHOD=stedi_api`)

## Eligibility / Prior Authorization APIs
- `AVAILITY_BASE_URL`
- `AVAILITY_CLIENT_ID`
- `AVAILITY_CLIENT_SECRET`
- `AVAILITY_TOKEN_URL`

## Optional Integrations (must be complete if enabled)
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- Dropbox Sign: `DROPBOX_SIGN_API_KEY`, `DROPBOX_SIGN_WEBHOOK_SECRET`
- Manual extraction LLM: `MANUAL_EXTRACTION_LLM=true` requires `OPENAI_API_KEY`
