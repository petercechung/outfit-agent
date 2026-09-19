-- Every request to /api/recommend, in full, while v2 is being tested. Testers are identified on purpose:
-- `tester` is the name from a ?tester= link, `client_id` a random id kept by the browser.
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  tester TEXT,
  client_id TEXT,
  country TEXT,
  user_agent TEXT,
  lang TEXT,
  turn TEXT NOT NULL,           -- 'new' | 'refine'
  sentence TEXT NOT NULL,       -- exactly what the stylist read (on a refine turn: the original plus the feedback)
  feedback TEXT,                -- the feedback alone, on a refine turn
  kind TEXT,                    -- outfit | vague | off_topic | care
  understood TEXT,
  question TEXT,                -- what was asked back, when no looks were shown
  budget_max_twd INTEGER,
  looks TEXT,                   -- JSON: the looks shown — title, total price, over budget, each item (id, name, price)
  plan TEXT,                    -- JSON: the stylist's full plan, including every search it wrote
  verdict TEXT,                 -- JSON: the critic's keep / problems / revise / question
  encoded_by TEXT,
  critic TEXT,
  ms_plan INTEGER, ms_search INTEGER, ms_judge INTEGER, ms_total INTEGER,
  error TEXT                    -- set when the request failed
);
CREATE INDEX requests_by_time ON requests (created_at);
CREATE INDEX requests_by_tester ON requests (tester, created_at);
