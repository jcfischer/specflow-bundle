-- UP
-- Add skip validation and audit trail fields
-- Tracks why features were skipped and validates skip decisions

-- Skip audit trail
ALTER TABLE features ADD COLUMN skip_reason TEXT;
ALTER TABLE features ADD COLUMN skip_justification TEXT;
ALTER TABLE features ADD COLUMN skip_validated_at TEXT;
ALTER TABLE features ADD COLUMN skip_duplicate_of TEXT;

-- DOWN
-- Note: SQLite doesn't support DROP COLUMN directly in older versions
-- This is a no-op for safety; manual intervention required for rollback
SELECT 1;
