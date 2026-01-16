-- UP
-- Add rich decomposition fields for batch mode support
-- All columns nullable for backward compatibility with existing features

-- Required fields for batch mode
ALTER TABLE features ADD COLUMN problem_type TEXT;
ALTER TABLE features ADD COLUMN urgency TEXT;
ALTER TABLE features ADD COLUMN primary_user TEXT;
ALTER TABLE features ADD COLUMN integration_scope TEXT;

-- Optional rich fields
ALTER TABLE features ADD COLUMN usage_context TEXT;
ALTER TABLE features ADD COLUMN data_requirements TEXT;
ALTER TABLE features ADD COLUMN performance_requirements TEXT;
ALTER TABLE features ADD COLUMN priority_tradeoff TEXT;

-- Uncertainty handling
ALTER TABLE features ADD COLUMN uncertainties TEXT;
ALTER TABLE features ADD COLUMN clarification_needed TEXT;

-- DOWN
-- Note: SQLite doesn't support DROP COLUMN directly in older versions
-- This is a no-op for safety; manual intervention required for rollback
SELECT 1;
