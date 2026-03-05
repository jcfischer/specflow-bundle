-- UP
-- Lifecycle extension: harden results, review records, approval gates

CREATE TABLE IF NOT EXISTS harden_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  test_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pass', 'fail', 'skip', 'pending')),
  evidence TEXT,
  ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX IF NOT EXISTS idx_harden_results_feature ON harden_results(feature_id);

CREATE TABLE IF NOT EXISTS review_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  passed INTEGER NOT NULL DEFAULT 0,
  checks_json TEXT,
  acceptance_json TEXT,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX IF NOT EXISTS idx_review_records_feature ON review_records(feature_id);

CREATE TABLE IF NOT EXISTS approval_gates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  rejection_reason TEXT,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX IF NOT EXISTS idx_approval_gates_feature ON approval_gates(feature_id);

-- DOWN
DROP TABLE IF EXISTS approval_gates;
DROP TABLE IF EXISTS review_records;
DROP TABLE IF EXISTS harden_results;
