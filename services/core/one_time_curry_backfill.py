import hashlib
import json
import os
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

CLAIM = "261751862E00"
PAID = Decimal("1282.47")
PAYMENT_DATE = "2026-09-15"
SERVICE_DATE = "2026-02-03"
PAYER = "Health Plan of Nevada"
BILLED = Decimal("7330.00")
REFERENCE = f"instamed:{CLAIM}:{PAYMENT_DATE}:{int(PAID * 100)}"
RECEIPT = "payment-backfill-20260920"


def main() -> None:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL missing")

    with psycopg.connect(url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select o.id::text as id,
                       o.org_id::text as org_id,
                       o.patient_id::text as patient_id,
                       o.order_number,
                       coalesce(o.total_paid, o.paid_amount, 0)::numeric as recorded_paid
                  from orders o
                 where regexp_replace(upper(coalesce(o.order_number,'')), '[^A-Z0-9]', '', 'g')
                       in (
                         regexp_replace(upper(%s), '[^A-Z0-9]', '', 'g'),
                         regexp_replace(upper('SFM' || %s), '[^A-Z0-9]', '', 'g')
                       )
                 limit 4
                """,
                (CLAIM, CLAIM),
            )
            orders = cur.fetchall()
            if len(orders) != 1:
                candidates = [
                    {"order_number": row["order_number"], "recorded_paid": str(row["recorded_paid"])}
                    for row in orders
                ]
                raise RuntimeError(
                    f"{RECEIPT} exact_order_match_required count={len(orders)} candidates={json.dumps(candidates)}"
                )

            order = orders[0]
            cur.execute(
                """
                select patient_control_number
                  from ledger_claims
                 where regexp_replace(upper(patient_control_number), '[^A-Z0-9]', '', 'g')
                       in (
                         regexp_replace(upper(%s), '[^A-Z0-9]', '', 'g'),
                         regexp_replace(upper('SFM' || %s), '[^A-Z0-9]', '', 'g')
                       )
                 limit 1
                """,
                (CLAIM, CLAIM),
            )
            pcn_row = cur.fetchone()
            pcn = pcn_row["patient_control_number"] if pcn_row else f"SFM{CLAIM}"

            cur.execute(
                """
                select source, paid
                  from (
                    select 'payment_outcomes'::text as source, paid_amount::numeric as paid
                      from payment_outcomes
                     where order_id=%s::uuid
                       and payment_status in ('paid','partially_paid')
                       and round(coalesce(paid_amount,0)::numeric,2)=round(%s::numeric,2)
                    union all
                    select 'eob_claims'::text as source, total_paid::numeric as paid
                      from eob_claims
                     where order_id=%s::uuid
                       and round(coalesce(total_paid,0)::numeric,2)=round(%s::numeric,2)
                  ) q
                 limit 1
                """,
                (order["id"], PAID, order["id"], PAID),
            )
            existing = cur.fetchone()
            operation = "duplicate" if existing else "inserted"

            if not existing:
                cur.execute(
                    """
                    insert into payment_outcomes(
                      org_id, order_id, claim_number, external_claim_number,
                      payer_id, payer_name, hcpcs_code, billed_amount, paid_amount,
                      is_denial, date_of_service, service_date, payment_date, adjudicated_at,
                      eob_reference, source, payment_status, adjustment_codes
                    ) values(
                      %s,%s::uuid,%s,%s,
                      null,%s,null,%s,%s,
                      false,%s::date,%s::date,%s::date,%s::date,
                      %s,'instamed_portal_backfill','paid',%s
                    )
                    """,
                    (
                        order["org_id"],
                        order["id"],
                        pcn,
                        CLAIM,
                        PAYER,
                        BILLED,
                        PAID,
                        SERVICE_DATE,
                        SERVICE_DATE,
                        PAYMENT_DATE,
                        PAYMENT_DATE,
                        REFERENCE,
                        json.dumps([]),
                    ),
                )

            cur.execute(
                """
                select coalesce(sum(
                         case when payment_status='reversed'
                              then -abs(paid_amount)
                              else paid_amount end
                       ),0)::numeric as total
                  from payment_outcomes
                 where order_id=%s::uuid
                   and payment_status in ('paid','partially_paid','reversed')
                   and coalesce(source,'') not like 'historical%%'
                """,
                (order["id"],),
            )
            total = cur.fetchone()["total"]
            total_paid = total if total and total > 0 else PAID

            cur.execute(
                """
                update orders
                   set total_paid=%s,
                       paid_amount=%s,
                       payment_date=%s::date,
                       paid_at=%s::date,
                       status='paid',
                       claim_status='paid',
                       updated_at=now()
                 where id=%s::uuid
                """,
                (total_paid, total_paid, PAYMENT_DATE, PAYMENT_DATE, order["id"]),
            )

            cur.execute(
                """
                update ledger_claims
                   set current_payer_processing_state='adjudicated_paid',
                       updated_at=now()
                 where regexp_replace(upper(patient_control_number), '[^A-Z0-9]', '', 'g')
                       = regexp_replace(upper(%s), '[^A-Z0-9]', '', 'g')
                """,
                (pcn,),
            )

            payload = {
                "source": "instamed_portal_backfill",
                "payer_claim_number": CLAIM,
                "paid_amount": float(PAID),
                "payment_date": PAYMENT_DATE,
                "payer_name": PAYER,
            }
            payload_sha = hashlib.sha256(
                json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            detail = (
                f"InstaMed portal payment backfill: paid ${PAID:.2f} on {PAYMENT_DATE}. "
                "Portal observation only; no Stedi 835 was represented or fabricated."
            )
            cur.execute(
                """
                insert into ledger_events(
                  patient_control_number,event_type,occurred_at,source,stedi_transaction_id,
                  status_categories,payer,payer_claim_control_numbers,detail,claim_frequency,
                  charge,hcpcs,dos,payload_sha256,wire_sha256
                ) values(
                  %s,'remittance_paid',%s::date,'instamed_portal_backfill',%s,
                  null,%s,%s,%s,null,%s,null,%s,%s,null
                )
                on conflict (stedi_transaction_id, patient_control_number, event_type) do nothing
                """,
                (
                    pcn,
                    PAYMENT_DATE,
                    REFERENCE,
                    PAYER,
                    [CLAIM],
                    detail,
                    str(BILLED),
                    [SERVICE_DATE.replace("-", "")],
                    payload_sha,
                ),
            )

        conn.commit()

    print(
        f"ONE_TIME_PAYMENT_BACKFILL_SUCCESS receipt={RECEIPT} "
        f"operation={operation} total_paid={total_paid}"
    )


if __name__ == "__main__":
    main()
