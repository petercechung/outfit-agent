-- The analyst agent's write-up of each look, requested by the page after the looks are shown (src/routes/analyze.ts).
CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  tester TEXT,
  client_id TEXT,
  model TEXT,
  sentence TEXT NOT NULL,
  look_title TEXT,
  article_ids TEXT,             -- JSON array, the garments analysed
  text TEXT,                    -- the analysis as shown
  ms INTEGER,
  error TEXT
);
CREATE INDEX analyses_by_time ON analyses (created_at);
