-- UP
CREATE TABLE IF NOT EXISTS revision_history (
  id TEXT PRIMARY KEY,
  artifact_path TEXT NOT NULL,
  previous_content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revision_history_path ON revision_history(artifact_path);
CREATE INDEX IF NOT EXISTS idx_revision_history_timestamp ON revision_history(timestamp);

-- DOWN
DROP INDEX IF EXISTS idx_revision_history_timestamp;
DROP INDEX IF EXISTS idx_revision_history_path;
DROP TABLE IF EXISTS revision_history;
