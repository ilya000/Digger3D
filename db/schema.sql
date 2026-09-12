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

-- How many games are played and by how many different people, per day.
-- `mark` is a short hash of the address, the browser and the day, so the same
-- visitor counts once a day and cannot be followed from one day to the next.
CREATE TABLE IF NOT EXISTS plays (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  day  TEXT NOT NULL,                       -- YYYY-MM-DD (UTC)
  mark TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- "visit" (the page opened) or "game" (a game started)
  at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS plays_by_day ON plays (day, kind);
CREATE INDEX IF NOT EXISTS plays_by_mark ON plays (day, mark);
