# POSEIDON EDI Service

Bidirectional EDI pipeline for POSEIDON healthcare RCM platform.

**Outbound (837P):** Build claims from PostgreSQL orders → submit to payers via Stedi API
**Inbound (835):** Parse ERA remittance files → auto-post payments → classify denials → feed Trident ML

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    POSEIDON EDI Service                   │
│                       Port 8005                          │
├──────────────────────┬───────────────────────────────────┤
│   837P OUTBOUND      │         835 INBOUND               │
│                      │                                   │
│  orders table        │    835 EDI file upload             │
│       ↓              │           ↓                       │
│  fetch_claim_data()  │    parse_835_x12()                │
│       ↓              │           ↓                       │
│  build_837p_payload() │    ┌─────────────────┐           │
│       ↓              │    │ remittance_batches│           │
│  Stedi Healthcare API │    │ remittance_claims │           │
│       ↓              │    │ remittance_adj    │           │
│  claim_submissions   │    │ remittance_svc    │           │
│       ↓              │    └────────┬──────────┘           │
│  poll 999/277 ack    │             ↓                     │
│                      │    auto_post → payment_outcomes   │
│                      │             ↓                     │
│                      │    denial worklist → Trident ML   │
└──────────────────────┴───────────────────────────────────┘
```

## Deployment

### Prerequisites
- POSEIDON stack running (PostgreSQL, Redis, nginx)
- Stedi account with API key (https://www.stedi.com)
- Clearinghouse enrollment (Trading Partner Agreement)

### Steps

1. Copy service code to production:
```bash
scp -r ./edi-claim-service root@157.230.145.247:/opt/poseidon/services/edi
```

2. Add env vars to `/opt/poseidon/.env`:
```bash
STEDI_API_KEY=<your-stedi-api-key>
ISA_SENDER_ID=STRYKEFOX       # 15 chars, from clearinghouse
ISA_RECEIVER_ID=030240928      # 15 chars, from clearinghouse
EDI_DRY_RUN=true               # false when ready for live submission
```

3. Add docker-compose block (see `docker-compose-snippet.yml`)

4. Run deploy script:
```bash
chmod +x /opt/poseidon/services/edi/scripts/deploy.sh
/opt/poseidon/services/edi/scripts/deploy.sh
```

## API Reference

### 837P Outbound Claims

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/claims/submit/{order_id}` | Submit single claim |
| POST | `/api/v1/claims/submit/batch` | Submit batch `{"order_ids": [1,2,3]}` |
| POST | `/api/v1/claims/resubmit/{submission_id}` | Resubmit rejected claim |
| POST | `/api/v1/claims/validate/{order_id}` | Dry-run validation |
| GET | `/api/v1/claims/status/{order_id}` | Submission status history |
| POST | `/api/v1/claims/poll-ack/{submission_id}` | Poll for 999/277 ack |
| GET | `/api/v1/claims/submissions` | List with filters |

### 835 Inbound Remittance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/remittance/upload` | Upload 835 file (multipart) |
| POST | `/api/v1/remittance/parse-raw` | Parse raw X12 string |
| GET | `/api/v1/remittance/batches` | List remittance batches |
| GET | `/api/v1/remittance/batch/{id}` | Full batch detail |
| POST | `/api/v1/remittance/batch/{id}/post` | Auto-post payments |
| GET | `/api/v1/remittance/denials` | Denial worklist |
| GET | `/api/v1/remittance/stats` | Remittance KPIs |

### Submission Lifecycle

```
837P: draft → validated → submitted → accepted/rejected → corrected → resubmitted
835:  received → parsing → parsed → posted
```

### Pre-Submission Validation

The `/validate` endpoint checks all required fields before building the 837P:
- Patient: name, DOB, member ID, address
- Organization: billing NPI, Tax ID
- Payer: assigned to order
- Clinical: HCPCS code (order or line items), diagnosis codes
- Financial: billed amount, date of service

### CARC Denial Classification

The 835 parser auto-classifies CARC codes into actionable categories:

| Category | CARCs | Suggested Action |
|----------|-------|------------------|
| eligibility | 1, 2, 27, 31, 96 | verify_eligibility_resubmit |
| medical_necessity | 50, 55-59, 151, 167 | appeal_with_clinical_notes |
| authorization | 4, 15, 38, 197 | obtain_auth_resubmit |
| coding | 5, 6, 11, 16, 144, 146 | review_coding_resubmit |
| timely_filing | 29, 119 | appeal_with_proof_of_timely |
| duplicate | 18, 97 | verify_original_claim |
| coordination | 22, 23, 24 | submit_to_secondary |
| contractual | 45, 253 | write_off |

### Trident Integration

Parsed 835 data feeds into Trident's ML training pipeline:
- Payment outcomes written to `payment_outcomes` table on auto-post
- Denial classifications update CARC-to-denial-probability weights
- Per-payer learned rates updated from `allowed_amount` fields

## File Structure

```
edi-claim-service/
├── app/
│   ├── main.py              # FastAPI app, health check, lifespan
│   ├── database.py          # asyncpg pool, audit logging
│   ├── builders/
│   │   └── claim_837p.py    # 837P JSON payload builder
│   ├── parsers/
│   │   └── era_835.py       # X12 835 segment parser + CARC classifier
│   ├── clients/
│   │   └── stedi.py         # Stedi API client
│   └── routers/
│       ├── claims_837p.py   # 837P submission endpoints
│       └── remittance_835.py # 835 ingest endpoints
├── migrations/
│   └── 001_edi_schema.sql   # All EDI tables (idempotent)
├── scripts/
│   └── deploy.sh            # Production deployment script
├── Dockerfile
├── requirements.txt
└── docker-compose-snippet.yml
```

## Non-Code Dependencies (Critical Path)

1. **Clearinghouse Trading Partner Agreement** — 2-6 week enrollment. Without this, no electronic claims can be submitted regardless of code readiness.

2. **ERA Enrollment** — Separate from claim submission enrollment. Must enroll for 835 ERA with each payer individually. Without this, the 835 parser has no data to ingest.

3. **Stedi API Key** — Sign up at stedi.com, generate API key in dashboard settings. Free tier covers development; production requires paid plan.

4. **ISA Sender/Receiver IDs** — 15-character identifiers assigned by your clearinghouse during Trading Partner enrollment. These go in `.env`.
