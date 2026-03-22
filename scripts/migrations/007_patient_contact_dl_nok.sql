-- Next of kin + drivers license object storage refs (JSONB for flexible shape)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS next_of_kin JSONB DEFAULT '{}'::jsonb;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS drivers_license JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN patients.next_of_kin IS 'e.g. {"name","relationship","phone","email"}';
COMMENT ON COLUMN patients.drivers_license IS 'e.g. {"storage_bucket","storage_key","file_name"} for ID image';
