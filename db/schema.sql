-- The shared high-score table of Digger 3D (Cloudflare D1).
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  initials   TEXT    NOT NULL,                 -- three characters, as in the game
  score      INTEGER NOT NULL,
  mark       TEXT,                             -- short hash of the address, for rate limiting only
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- the order the game shows: best first, an equal score below the older one
CREATE INDEX IF NOT EXISTS scores_ranking ON scores (score DESC, id ASC);
CREATE INDEX IF NOT EXISTS scores_recent ON scores (mark, created_at);
