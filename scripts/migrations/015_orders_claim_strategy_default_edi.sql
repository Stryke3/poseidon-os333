-- Default outbound claims path: EDI. Backfill existing NULL rows.

UPDATE orders SET claim_strategy = 'EDI' WHERE claim_strategy IS NULL;

ALTER TABLE orders ALTER COLUMN claim_strategy SET DEFAULT 'EDI';
