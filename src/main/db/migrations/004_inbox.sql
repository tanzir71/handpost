CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  source TEXT,
  source_kind TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  stored_path TEXT,
  content_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'schedule',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  errors_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminal_at TEXT,
  replaced_at TEXT,
  root TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS idx_inbox_state ON inbox_items(state);
CREATE INDEX IF NOT EXISTS idx_inbox_post ON inbox_items(post_id);
CREATE TABLE IF NOT EXISTS inbox_files (
  id INTEGER PRIMARY KEY,
  item_id TEXT,
  file_name TEXT NOT NULL,
  stored_path TEXT,
  source TEXT,
  outcome TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  errors_json TEXT NOT NULL DEFAULT '[]',
  processed_at TEXT NOT NULL,
  root TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS idx_inbox_files_item ON inbox_files(item_id);
CREATE INDEX IF NOT EXISTS idx_inbox_files_time ON inbox_files(processed_at);
ALTER TABLE posts ADD COLUMN labels_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE accounts ADD COLUMN handle TEXT;
ALTER TABLE accounts ADD COLUMN profile_url TEXT;
