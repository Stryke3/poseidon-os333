# Railway intake activation status — 2026-10-19

The agreed path remains webform → patients@strykefox.com → SPEAR intake → patient acknowledgment → SWO workflow.

## Verified runtime

- The running backend is Railway project `poseidon-core`, production environment, services `intake` and `core`.
- Both services use `Stryke3/poseidon-os333`, branch `redis-degraded-mode-20260816`.
- The Render services inspected on this date are suspended older copies; restoring them is not part of this cutover.
- Draft PR #13 targets the correct Railway branch. A draft commit is not a production deployment.
- Railway's variable listing showed no Zoho or Dropbox runtime keys on intake/Core. Values were redacted by the connector; no secret values were retrieved.

## Changes in this follow-up

- An email containing no recognized intake rows remains unread and returns `needs_review`.
- A successful HTTP import response is checked for a created order for each input row. Partial, ambiguous, duplicate, or missing row results remain visible for review.
- A workflow failure retains the import receipt and leaves the email unread.
- Welcome delivery requires a confirmed SPEAR order.
- Welcome delivery records a durable dispatch reservation before network I/O. Sent, uncertain, and interrupted attempts cannot automatically send again. Concurrent requests share a database lock.
- SQL binding preserves repeated placeholders and escapes literal percent signs.

## Remaining integration work

The MommyCare source inspected in `Stryke3/sfm-finals/sfm-mommycare-en/index.html` submits Web3Forms fields for name, email, phone, due date, state, insurance, member ID, DOB, Medicaid, requested items, notes, and SMS consent. The backend email poll currently reads PDF/CSV/XLSX attachments only. The actual delivered email template and the deployed site's source mapping still need verification.

A synthetic example of the received email (preferably original `.eml`, without real patient information) is needed to verify body-field parsing. Unsupported messages now remain unread; this change does **not** claim that body-only webforms are imported.

The separate `/api/v1/mck/intake` endpoint is not yet called by the email poll. The email adapter must preserve the original message/submission reference, call that endpoint, wait for the confirmed SPEAR record and welcome result, then continue the intended SWO workflow. CarePath JSON attachments also need a verified schema adapter. Do not treat these separate endpoints as an end-to-end connected workflow.

Before scheduling repeat polls, resolve per-message replay tracking for partial imports and workflow failures. Leaving an email unread protects visibility but is not an exactly-once import mechanism.

## Runtime settings to enter through Railway's Variables interface

For Zoho Mail on the relevant intake/Core services:

- `EMAIL_PROVIDER=zoho`
- `EMAIL_INTAKE_USERNAME=patients@strykefox.com`
- `ZOHO_OAUTH_CLIENT_ID`
- `ZOHO_OAUTH_CLIENT_SECRET`
- `ZOHO_OAUTH_REFRESH_TOKEN`
- `ZOHO_MAIL_ACCOUNT_ID`
- `ZOHO_MAIL_FOLDER_ID`
- Region-specific settings when the account is outside the default US region.

The previously shown OAuth grant included read permissions but lacked Mail send and message-update permissions. The replacement grant needs the permissions used by this implementation, including `ZohoMail.messages.CREATE` and `ZohoMail.messages.UPDATE`, as well as the existing accounts/message read and Sheet permissions.

For Core MCK projection: `MCK_ORG_ID`, `MCK_ZOHO_SHEET_RESOURCE_ID`, and the actual Sheet worksheet mappings documented in `MCK_ZOHO_SPEAR_AUTOMATION.md`.

Attachment archiving additionally requires the Dropbox settings in `ZOHO_DROPBOX_CUTOVER.md`. The existing generic order-import/advance calls require `CORE_API_EMAIL`, `CORE_API_PASSWORD`, and the shared internal API key; those login variables were absent on intake at inspection time.

Keep secrets in the deployment secret manager. Do not commit tokens or paste them into issue/PR descriptions.

## Verification before activation

Run the business-channel CI, then exercise the complete path with a synthetic fixture and controlled test recipient after runtime configuration is complete. Verify the stored SPEAR IDs, Sheet projection, welcome receipt, replay behavior, and SWO transition separately.

An uncertain welcome result requires checking Zoho Sent and reconciling the recorded delivery state. Do not delete dispatch/uncertain markers merely to make a retry send.

No production cutover, live patient email, payer transaction, claim, or fax was executed during this follow-up.
