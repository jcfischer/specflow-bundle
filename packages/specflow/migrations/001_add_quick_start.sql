-- UP
ALTER TABLE features ADD COLUMN quick_start INTEGER DEFAULT 0;

-- DOWN
-- Note: SQLite doesn't support DROP COLUMN directly in older versions
-- This is a no-op for safety; manual intervention required for rollback
SELECT 1;
