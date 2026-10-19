# StrykeFox channel cutover — October 19, 2026

Owner-directed operating destinations:

| Work | Destination | Cutover state |
| --- | --- | --- |
| Business correspondence | Zoho Mail | Runtime adapter prepared; OAuth connection required |
| Operational spreadsheets | Zoho Sheet | Scheduled instructions updated; current workbook resource IDs required |
| Working files and evidence | Dropbox | Connected for agent reads; runtime upload OAuth and intake path required |
| Fax and signatures | Existing Dropbox Fax / Dropbox Sign integrations | Existing direct-provider paths preserved |
| Case, claim and payment state | Existing SPEAR / Core / Stedi systems | Existing decision and financial rules preserved |
| MCP Run tool routing | Existing owner workspace | Admin/workspace URL and current configuration have not been located |

Twelve StrykeFox-related ChatGPT automation prompts were updated and read back.
Schedules, enabled/paused states and unrelated personal Gmail workflows were preserved.
Legacy Google IDs in historical notes are provenance, not current routing.

## Prepared code

Intake uses Zoho OAuth, verifies the actual mailbox account, and maps the existing
`INBOX` request to an explicitly configured Zoho folder ID. It accepts `UNSEEN`
and `ALL`; migrate any custom Gmail search expression explicitly before use.
Message bodies are fetched as original MIME, preserving the RFC Message-ID.
Inline image parts are excluded from actual attachments.

Every actual attachment is archived to a verified Dropbox destination before Core
order import or an explicit read-state update. Storage uses deterministic paths,
add-only writes, content-hash validation and metadata readback. Repeating a storage
operation reconciles the existing file before uploading. An ambiguous upload/send
has no automatic retry. This is storage idempotency; reconcile existing intake and
Core import checkpoints before replaying migrated messages.

The frontend source mirror now sends through Zoho Mail. Website inquiries preserve
their content and reply-to address. CarePath preserves its JSON packet attachment,
stops logging referral packets when email is unconfigured, and reports delivery
failure instead of returning a false success. The separately deployed
`Stryke3/spear-platform` repository has a separately prepared matching frontend patch.

## Deployment secrets and mappings

Set these only in the deployment/runner secret manager. No values are included here.

| Variable | Purpose |
| --- | --- |
| `EMAIL_PROVIDER=zoho` | Explicit provider selection; Google fallback is disabled |
| `EMAIL_INTAKE_USERNAME` | Actual `@strykefox.com` mailbox identity |
| `EMAIL_INTAKE_MAILBOX` | Request mailbox label, normally `INBOX` |
| `ZOHO_REGION` | Correct account data center, default `com` |
| `ZOHO_OAUTH_CLIENT_ID`, `ZOHO_OAUTH_CLIENT_SECRET`, `ZOHO_OAUTH_REFRESH_TOKEN` | Zoho OAuth connection |
| `ZOHO_MAIL_ACCOUNT_ID`, `ZOHO_MAIL_FOLDER_ID` | Verified account and intake-folder IDs |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | Runtime Dropbox Files connection; separate from Fax/Sign keys |
| `DROPBOX_ROOT_NAMESPACE_ID`, `DROPBOX_INTAKE_PATH` | Verified namespace and existing intake destination under `/2. SFM` |

Zoho Mail reads require `ZohoMail.accounts.READ` and `ZohoMail.messages.READ`;
explicit read-state changes additionally require `ZohoMail.messages.UPDATE`;
website mail/attachment creation requires `ZohoMail.messages.CREATE`. Preserve the
owner's communication approvals; transport migration supplies no new send authority.
Dropbox needs the existing authorized account and file metadata/read/write scopes.
Complete any new OAuth grants through the secure consent flow.

## Remaining activation work

1. Open the owner's actual MCP Run workspace and read its current tools, workflows,
   secret references and checkpoints. Replace business Gmail/Drive/Sheets routes
   with the corresponding authorized Zoho Mail / Zoho Sheet / Dropbox tools.
   No importable MCP Run profile format is assumed or fabricated in this change.
2. Resolve the migrated Mommy Care Kit tracker and other live workbooks by actual
   Zoho resource IDs and worksheet names. Preserve stable patient Record IDs,
   formulas, notes, dropdowns, history and concurrent edits. Google spreadsheet
   tab IDs cannot be reused as Zoho worksheet IDs.
3. Resolve the existing migrated intake folder; do not guess a replacement or
   treat the `/Archive/Drive` copy as a current processing destination.
4. Configure the connections, validate the mailbox and folder identities, run a
   synthetic attachment through Zoho → Dropbox → the existing intake workflow,
   and reconcile resulting evidence before activating unattended processing.
5. Deploy the tested changes to the actual intake branch and frontend project,
   verify terminal deployment success, then verify the live route. No production
   cutover or live end-to-end validation was performed during preparation.

## Validation

The new Python contract suite uses synthetic content and mocked HTTP transports;
it covers identity mismatches, API failures inside HTTP 200 responses, missing MIME,
folder mismatches, disabled Google fallback, inline-image exclusion, Dropbox
content integrity, duplicate storage, permissions errors and ambiguous uploads.
No messages, faxes, claims or applications are sent by the tests.

Official contracts:
- https://www.zoho.com/mail/help/api/get-all-users-accounts.html
- https://www.zoho.com/mail/help/api/get-emails-list.html
- https://www.zoho.com/mail/help/api/get-original-message.html
- https://www.zoho.com/mail/help/api/put-mark-email-as-read.html
- https://www.zoho.com/mail/help/api/post-send-email-attachment.html
- https://www.zoho.com/mail/help/api/post-upload-attachments.html
- https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/content-hash
- https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/path-root-header-modes
