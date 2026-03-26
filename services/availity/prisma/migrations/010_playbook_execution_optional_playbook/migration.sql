-- Allow logging playbook runs when no row matches (every execution must be recorded).
ALTER TABLE "playbook_executions" ALTER COLUMN "playbook_id" DROP NOT NULL;
