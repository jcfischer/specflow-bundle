-- UP
-- Add contrib prep state tracking table
-- Tracks the contribution preparation workflow (inventory → sanitize → extract → verify)

CREATE TABLE IF NOT EXISTS contrib_prep_state (
  feature_id TEXT PRIMARY KEY,
  gate INTEGER NOT NULL DEFAULT 0,
  inventory_included INTEGER DEFAULT 0,
  inventory_excluded INTEGER DEFAULT 0,
  sanitization_pass INTEGER,
  sanitization_findings INTEGER DEFAULT 0,
  tag_name TEXT,
  tag_hash TEXT,
  contrib_branch TEXT,
  verification_pass INTEGER,
  base_branch TEXT DEFAULT 'main',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

-- DOWN
DROP TABLE IF EXISTS contrib_prep_state;
