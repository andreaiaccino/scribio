PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meetings (
  id           TEXT PRIMARY KEY,            -- uuid v4
  title        TEXT NOT NULL,
  template_id  TEXT,
  language     TEXT NOT NULL DEFAULT 'it',
  status       TEXT NOT NULL,               -- recording|transcribing|enhancing|ready|error
  started_at   INTEGER NOT NULL,            -- epoch ms
  ended_at     INTEGER,
  participants TEXT,                        -- JSON array di stringhe
  consent_flag INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id         TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker    TEXT NOT NULL,                 -- 'me' | 'others'
  ts_start   REAL NOT NULL,                 -- secondi dall'inizio
  ts_end     REAL,
  text       TEXT NOT NULL,
  seq        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments(meeting_id, seq);

CREATE TABLE IF NOT EXISTS raw_notes (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enhanced_notes (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  summary    TEXT,
  model      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT,
  prompt     TEXT NOT NULL,                 -- istruzioni specifiche del template
  structure  TEXT,                          -- struttura attesa della nota (markdown)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Ricerca full-text (MVP). La semantica/vettoriale è Fase 1.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  meeting_id UNINDEXED,
  kind,                                     -- 'enhanced'|'transcript'|'raw'
  content
);
