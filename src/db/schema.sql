-- Core schema. Idempotent: safe to run on every startup.
-- Reddit IDs are stored as base36 without the type prefix (e.g. "1abc2d"); fullnames add "t3_"/"t1_".

-- ─── Sources: what we crawl ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('subreddit', 'thread', 'search')),
  subreddit     TEXT,                    -- subreddit / search scope (null for thread = derived from post)
  query         TEXT,                    -- search only
  post_id       TEXT,                    -- thread only
  vertical      TEXT,                    -- e.g. 'accounting', 'trades', 'smb-general'
  discover      INTEGER NOT NULL DEFAULT 1, -- subreddit only: run web-search pain-phrase discovery on it
  enabled       INTEGER NOT NULL DEFAULT 1,
  added_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  backfilled_at INTEGER                  -- null → next collect/refresh does a full backfill
);
CREATE UNIQUE INDEX IF NOT EXISTS sources_identity
  ON sources (type, COALESCE(lower(subreddit), ''), COALESCE(query, ''), COALESCE(post_id, ''));

-- ─── Raw Reddit data ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id                  TEXT PRIMARY KEY,
  subreddit           TEXT NOT NULL,
  author              TEXT,
  title               TEXT NOT NULL,
  selftext            TEXT,
  url                 TEXT,
  permalink           TEXT NOT NULL,
  flair               TEXT,
  is_self             INTEGER,
  over_18             INTEGER,
  created_utc         INTEGER NOT NULL,
  ingest_method       TEXT NOT NULL DEFAULT 'rss', -- 'rss' | 'api'; engagement fields below are API-only (null via RSS)
  score               INTEGER,
  upvote_ratio        REAL,
  num_comments        INTEGER,
  is_removed          INTEGER NOT NULL DEFAULT 0, -- deleted/removed upstream; content scrubbed on re-crawl
  first_seen_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  comments_fetched_at INTEGER,
  comments_fetched_n  INTEGER            -- comments seen at last fetch (to detect growth)
);
CREATE INDEX IF NOT EXISTS posts_sub_created ON posts (subreddit, created_utc);
CREATE INDEX IF NOT EXISTS posts_created ON posts (created_utc);

-- Which source(s) surfaced a post, and via which listing.
CREATE TABLE IF NOT EXISTS post_sources (
  post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  source_id     INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  listing       TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (post_id, source_id, listing)
);
CREATE INDEX IF NOT EXISTS post_sources_source ON post_sources (source_id);

CREATE TABLE IF NOT EXISTS comments (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id     TEXT,                    -- fullname: t3_/t1_ (API only)
  author        TEXT,
  body          TEXT,
  position      INTEGER,                 -- order in the thread feed (sort=top), 0 = top comment
  score         INTEGER,                 -- API only
  depth         INTEGER,                 -- API only
  created_utc   INTEGER NOT NULL,
  is_removed    INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS comments_post ON comments (post_id, position);

-- Threads whose full content + comments should be fetched: web-search discoveries, manual thread
-- sources, and (later) classifier-flagged pain points. One row per (thread, reason).
CREATE TABLE IF NOT EXISTS thread_requests (
  post_id      TEXT NOT NULL,            -- no FK: the post row may not exist until fetched
  subreddit    TEXT NOT NULL,
  source_id    INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,            -- 'search:<phrase>', 'search:<custom query>', 'manual', 'enrich'
  rank         INTEGER,                  -- position in search results
  snippet      TEXT,                     -- search result description
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (post_id, reason)
);

CREATE TABLE IF NOT EXISTS thread_fetches (
  post_id     TEXT PRIMARY KEY,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_status INTEGER,                   -- HTTP status of last attempt
  last_error  TEXT,
  fetched_at  INTEGER                    -- null until a successful fetch
);

-- ─── Crawl bookkeeping (resume + deltas) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS crawl_state (
  source_id          INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  listing            TEXT NOT NULL,      -- 'rss:new', 'search:<phrase or query>', later 'api:top:year', ...
  newest_id          TEXT,               -- high-water mark for delta pulls on 'new'
  newest_created_utc INTEGER,
  resume_after       TEXT,               -- pagination cursor if a run was interrupted
  last_run_at        INTEGER,
  last_completed_at  INTEGER,
  PRIMARY KEY (source_id, listing)
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,             -- 'collect', 'refresh', 'classify', 'embed', 'cluster', ...
  started_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER,
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
  stats       TEXT                       -- JSON: requests made, rows upserted, cost, ...
);

-- ─── Analysis ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classification_batches (
  id            TEXT PRIMARY KEY,        -- Anthropic Message Batch id
  model         TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status        TEXT NOT NULL,           -- in_progress | ended | canceled | imported
  request_count INTEGER NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at      INTEGER,
  imported_at   INTEGER
);

CREATE TABLE IF NOT EXISTS classifications (
  post_id           TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  batch_id          TEXT REFERENCES classification_batches(id),
  model             TEXT NOT NULL,
  prompt_version    TEXT NOT NULL,
  is_pain_point     INTEGER NOT NULL,
  problem_summary   TEXT,
  persona           TEXT,
  industry          TEXT,
  workflow_category TEXT,
  willingness_to_pay INTEGER,            -- 0–3
  wtp_evidence      TEXT,
  existing_tools    TEXT,                -- JSON array
  underserved       INTEGER,             -- 0–3
  ai_solvability    INTEGER,             -- 0–3
  ai_capability     TEXT,                -- extraction | generation | agent | voice | vision | other
  emotional_intensity INTEGER,           -- 0–3
  rationale         TEXT,
  raw               TEXT,                -- full JSON response for auditing
  classified_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS classifications_pain ON classifications (is_pain_point);

-- Vectors live in a sqlite-vec virtual table created in code (dimension is configurable).
CREATE TABLE IF NOT EXISTS embeddings_meta (
  post_id     TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  model       TEXT NOT NULL,
  source_text TEXT NOT NULL,             -- what was embedded (problem_summary)
  embedded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS clusters (
  id                INTEGER PRIMARY KEY,
  run_id            INTEGER REFERENCES runs(id),
  is_current        INTEGER NOT NULL DEFAULT 1,
  label             TEXT,
  problem_statement TEXT,
  who               TEXT,                -- personas affected
  labeled_size      INTEGER,             -- size when label was written (relabel after growth)
  representative_quotes TEXT,            -- JSON array of {post_id, quote}
  centroid          BLOB,                -- float32 array, for assigning new points incrementally
  size              INTEGER NOT NULL DEFAULT 0,
  n_subreddits      INTEGER NOT NULL DEFAULT 0,
  engagement        REAL,
  avg_wtp           REAL,
  avg_ai_solvability REAL,
  avg_underserved   REAL,
  avg_emotional_intensity REAL,
  score             REAL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS clusters_current_score ON clusters (is_current, score DESC);

CREATE TABLE IF NOT EXISTS cluster_members (
  cluster_id  INTEGER NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  distance    REAL,
  assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (cluster_id, post_id)
);
CREATE INDEX IF NOT EXISTS cluster_members_post ON cluster_members (post_id);

-- Daily snapshot so the dashboard can show growth / "new this week".
CREATE TABLE IF NOT EXISTS cluster_snapshots (
  snapshot_date TEXT NOT NULL,           -- YYYY-MM-DD
  cluster_id    INTEGER NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  size          INTEGER NOT NULL,
  engagement    REAL,
  score         REAL,
  PRIMARY KEY (snapshot_date, cluster_id)
);

-- ─── Eval ──────────────────────────────────────────────────────────────────
-- Human labels (the answer key) and model predictions per prompt version.
CREATE TABLE IF NOT EXISTS eval_labels (
  post_id            TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  is_pain_point      INTEGER NOT NULL,
  willingness_to_pay INTEGER,
  ai_solvability     INTEGER,
  underserved        INTEGER,
  notes              TEXT,
  labeled_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS eval_predictions (
  post_id        TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  prompt_version TEXT NOT NULL,
  model          TEXT NOT NULL,
  output         TEXT NOT NULL,          -- validated JSON
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (post_id, prompt_version, model)
);
