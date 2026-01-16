-- UP
ALTER TABLE features ADD COLUMN doctorow_verified INTEGER DEFAULT 0;
ALTER TABLE features ADD COLUMN doctorow_skips TEXT;

-- DOWN
SELECT 1;
