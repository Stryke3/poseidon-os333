# STEDI Production Setup

SPEAR ships Stedi support disabled by default. Do not enable live claim submission until test eligibility, test claim, 277CA, 835, and Poseidon posting have been validated.

## Vercel Environment Variables

```bash
STEDI_API_KEY=
STEDI_MODE=test
STEDI_ENABLE_ELIGIBILITY=false
STEDI_ENABLE_CLAIMS=false
STEDI_ENABLE_ATTACHMENTS=false
STEDI_ENABLE_STATUS=false
STEDI_ENABLE_ERA=false
STEDI_ENABLE_AUTO_POST=false
STEDI_ENABLE_LIVE_SUBMISSION=false
STEDI_WEBHOOK_SECRET=
STEDI_SUBMITTER_ID=
STEDI_ELIGIBILITY_FRESHNESS_HOURS=24
CLAIM_STATUS_INITIAL_DAYS=14
CLAIM_STATUS_REPEAT_DAYS=7
```

Initial production-safe connectivity setting:

```bash
STEDI_MODE=production
STEDI_ENABLE_ELIGIBILITY=true
STEDI_ENABLE_CLAIMS=false
STEDI_ENABLE_ATTACHMENTS=false
STEDI_ENABLE_STATUS=false
STEDI_ENABLE_ERA=false
STEDI_ENABLE_AUTO_POST=false
STEDI_ENABLE_LIVE_SUBMISSION=false
```

## Operator Setup

1. Create a Stedi account.
2. Create test and production API keys.
3. Configure billing/rendering provider information.
4. Configure `STEDI_SUBMITTER_ID`.
5. Complete payer transaction enrollments as required.
6. Complete ERA/835 enrollment as required.
7. Configure the Stedi healthcare transaction-processing webhook:
   `https://dashboard.strykefox.com/api/spear/integrations/stedi/webhook`
8. Configure webhook authentication/signature secret and set `STEDI_WEBHOOK_SECRET`.
9. Add the Vercel environment variables.
10. Start in `STEDI_MODE=test`.
11. Run a real eligibility test.
12. Run a test professional claim workflow.
13. Validate 277CA retrieval and duplicate webhook handling.
14. Validate 835 retrieval where supported by the payer/test flow.
15. Validate Poseidon posting and exception behavior.
16. Enable production claims only after enrollment and reconciliation validation.

## Go-Live Checklist

- Stedi account active.
- Test API key validated.
- Production API key stored only in Vercel environment variables.
- Payer enrollments complete for eligibility/claims/ERA as applicable.
- Webhook endpoint configured and signature verified.
- Eligibility check returns normalized SPEAR status.
- Claim validation blocks incomplete cases.
- Claim submission safety gate blocks production unless `STEDI_ENABLE_LIVE_SUBMISSION=true`.
- 277CA duplicate webhook does not double-process.
- 835 does not mark bank reconciliation complete.
- Auto-posting remains off unless reconciliation controls are validated.

## Endpoints Implemented

- Eligibility JSON API: `/change/medicalnetwork/eligibility/v3`
- 837P professional claim submission: `/change/medicalnetwork/professionalclaims/v3/submission`
- 275 attachment creation: `https://claims.us.stedi.com/2025-03-07/claim-attachments/file`
- 276/277 claim status: `/change/medicalnetwork/claimstatus/v2`
- 277CA report: `/change/medicalnetwork/reports/v2/{transactionId}/277`
- 835 ERA report: `/change/medicalnetwork/reports/v2/{transactionId}/835`
