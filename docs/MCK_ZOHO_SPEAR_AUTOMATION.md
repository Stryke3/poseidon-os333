# Mommy Care Kit — Zoho → SPEAR → Tracker / Welcome Automation

## Operating contract

SPEAR/Core is the canonical patient and case system. Zoho is the controlled
intake, spreadsheet-projection, and business-mail channel.

A new Mommy Care Kit submission follows this sequence:

1. Zoho Flow, Zoho Forms, or another approved MCP Run source calls the Core
   endpoint `POST /api/v1/mck/intake`.
2. Core reconciles the patient by organization, first name, last name, and DOB.
3. Core creates one idempotent Mommy Care Kit order using the supplied
   `source_reference` as the transaction key.
4. The workflow upserts the same stable `Record ID` into the migrated Zoho
   Sheet tabs `Patient Details` and `Heather Cover`.
5. When a patient email is present and a prior confirmed welcome-send event is
   absent, Zoho Mail sends the warm welcome email from the verified
   `patients@strykefox.com` account.
6. Each completed, blocked, failed, or uncertain leg is recorded separately in
   `workflow_events`.

The endpoint never invents a DOB, member ID, provider NPI, diagnosis, or HCPCS
code. A missing DOB blocks the SPEAR create/reconcile leg while the tracker and
welcome legs may continue with a documented missing-information status.

## Intake endpoint

Authentication uses the existing `X-Internal-API-Key` header. Zoho Flow must
store the key in a secure connection or secret reference; it must not be placed
in a Deluge script body or user-visible field.

Example payload:

```json
{
  "source_reference": "zoho-form:<immutable-submission-id>",
  "submitted_at": "2026-10-19T16:15:00-07:00",
  "first_name": "Example",
  "last_name": "Patient",
  "date_of_birth": "1990-01-15",
  "due_date": "2027-02-20",
  "phone": "7025550100",
  "email": "patient@example.com",
  "address_line1": "100 Main Street",
  "address_line2": "Apt 2",
  "city": "Las Vegas",
  "state": "NV",
  "zip_code": "89101",
  "insurance_plan": "UnitedHealthcare",
  "payer_id": null,
  "member_id": null,
  "group_number": null,
  "medicaid": true,
  "provider_name": "Ordering Provider",
  "provider_npi": null,
  "provider_practice": "WHASN",
  "provider_phone": "7025550110",
  "provider_fax": null,
  "items_requested": [
    "Electric Breast Pump",
    "Maternity Back Brace / Belly Band"
  ],
  "notes": null
}
```

The response is intentionally leg-specific:

```json
{
  "record_id": "MCK-...",
  "source_reference": "zoho-form:<immutable-submission-id>",
  "spear": {"status": "confirmed", "patient_id": "...", "order_id": "..."},
  "sheet": {"status": "confirmed", "patient_details": "created", "heather_cover": "created"},
  "welcome": {"status": "confirmed", "message_id": "..."},
  "complete": true
}
```

`200` means every applicable leg is confirmed. `207` means at least one leg is
blocked, failed, or uncertain. Zoho Flow must store the response and route a
`207` to the operating exception queue; it must not re-run the entire workflow.
The stable `source_reference` makes a deliberate replay reconcile the same
SPEAR order and tracker rows.

## Welcome email

The welcome email:

- comes from the verified `patients@strykefox.com` Zoho Mail account;
- requests the insurance card, photo ID, full home shipping address, DOB, and
  provider information only when those fields remain missing;
- identifies Heather as the Mommy Care Consultant;
- explains the provider-documentation, benefit-review, authorization, and
  ordering workflow and the typical 4–6 week completion period;
- records the returned Zoho message ID before a send is treated as confirmed.

A missing patient email produces `welcome.status=blocked`. A transport timeout
or response without a confirmable Zoho message ID produces
`welcome.status=uncertain`. An uncertain send is never automatically retried;
operations must reconcile the Zoho Sent folder first.

## Zoho Sheet projection

The workflow uses Zoho Sheet's tabular-data API and upserts by the stable
`Record ID` column. It never keys the projection by a row number, patient name,
or sorted position.

Required workbook structure:

- `Patient Details` with the migrated headers, including `Record ID`;
- `Heather Cover` with the migrated headers, including `Record ID`;
- header row configured by `MCK_ZOHO_SHEET_HEADER_ROW` (default `4`).

The configured workbook is the live Zoho resource identified by
`MCK_ZOHO_SHEET_RESOURCE_ID`. Retired Google spreadsheet and worksheet IDs are
migration provenance only and cannot be used as Zoho resource identifiers.

## Payment-posted notification

The background worker checks Core for Mommy Care Kit / maternity orders where:

- `orders.status = 'paid'`; and
- `orders.paid_amount > 0`.

That is the paid-posted trigger. A projected payment, claim acceptance, EOB,
allowed amount, or payment expectation does not qualify.

For each qualifying order, the worker requires a complete shipping address:
address line 1, city, state, and ZIP. It then emails the approved internal
recipients configured in `MCK_PAID_NOTIFICATION_RECIPIENTS`, defaulting to:

- `ben@strykefox.com`
- `heather@strykefox.com`

The internal email contains only:

- patient name; and
- complete shipping address.

It does not include DOB, member ID, payer data, diagnosis, HCPCS, paid amount,
or claim details. Recipient validation restricts this notification to
`@strykefox.com` addresses.

A PostgreSQL advisory lock prevents concurrent sends. The order is also guarded
by `workflow_events` states:

- `mck.payment_notification.dispatching`
- `mck.payment_notification.sent`
- `mck.payment_notification.uncertain`
- `mck.payment_notification.blocked`

A missing address is blocked and surfaced for correction. An ambiguous mail
send is marked uncertain and is not automatically retried. The worker can also
be invoked through the internal endpoint:

```http
POST /api/v1/mck/paid-notifications/run
X-Internal-API-Key: <secret>
Content-Type: application/json

{"limit": 25}
```

## Required configuration

```text
EMAIL_PROVIDER=zoho
EMAIL_INTAKE_USERNAME=patients@strykefox.com
EMAIL_INTAKE_MAILBOX=INBOX
ZOHO_REGION=com
ZOHO_OAUTH_CLIENT_ID=...
ZOHO_OAUTH_CLIENT_SECRET=...
ZOHO_OAUTH_REFRESH_TOKEN=...
ZOHO_MAIL_ACCOUNT_ID=...
ZOHO_MAIL_FOLDER_ID=...

MCK_ZOHO_SHEET_RESOURCE_ID=...
MCK_ZOHO_PATIENT_DETAILS_SHEET=Patient Details
MCK_ZOHO_HEATHER_COVER_SHEET=Heather Cover
MCK_ZOHO_SHEET_HEADER_ROW=4
MCK_ORG_ID=...

MCK_PAID_NOTIFICATION_ENABLED=true
MCK_PAID_NOTIFICATION_POLL_SECONDS=60
MCK_PAID_NOTIFICATION_RECIPIENTS=ben@strykefox.com,heather@strykefox.com
```

The shared Zoho refresh token may be reused for Sheet only when its OAuth grant
includes both Mail and Sheet scopes. Dedicated Sheet credentials can instead be
provided through `ZOHO_SHEET_OAUTH_CLIENT_ID`,
`ZOHO_SHEET_OAUTH_CLIENT_SECRET`, and `ZOHO_SHEET_OAUTH_REFRESH_TOKEN`.

Required scopes:

- `ZohoMail.accounts.READ`
- `ZohoMail.messages.READ`
- `ZohoMail.messages.CREATE`
- `ZohoMail.messages.UPDATE` when the intake poller marks mail read
- `ZohoSheet.dataAPI.READ`
- `ZohoSheet.dataAPI.UPDATE`

## Activation checklist

1. Verify the Zoho Mail account ID belongs to `patients@strykefox.com` and the
   folder ID maps to the intended intake folder.
2. Verify the Zoho Sheet resource ID and both worksheet names against the live
   migrated workbook.
3. Verify the `Record ID` column is present and unique on both tabs.
4. Set `MCK_ORG_ID` to the actual SPEAR organization UUID.
5. Run the contract tests and Python compilation in the business-channel CI.
6. Submit one synthetic intake with non-production data and verify the returned
   SPEAR IDs, both Sheet rows, and Zoho Sent message ID.
7. Post one synthetic paid order with a complete synthetic address and verify
   exactly one internal notification reaches both approved recipients.
8. Re-run both transactions with the same source/order identity and verify no
   duplicate patient, order, tracker row, welcome email, or paid email is
   created.
9. Enable the production trigger only after the synthetic evidence reconciles.

No Google Mail, Drive, Sheets, or Apps Script fallback is authorized.
