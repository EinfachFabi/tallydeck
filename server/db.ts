import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type FeedType = 'youtube' | 'rss';

export const FEED_TYPES: readonly FeedType[] = ['youtube', 'rss'];

export function isFeedType(value: unknown): value is FeedType {
  return value === 'youtube' || value === 'rss';
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feeds (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT    NOT NULL CHECK (type IN ('youtube', 'rss')),
  title           TEXT    NOT NULL,
  feed_url        TEXT    NOT NULL,
  source_url      TEXT,
  site_url        TEXT,
  channel_id      TEXT,
  icon_url        TEXT,
  category        TEXT,
  last_fetched_at INTEGER,
  last_error      TEXT,
  created_at      INTEGER NOT NULL,
  UNIQUE (type, feed_url)
);

CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id       INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  external_id   TEXT    NOT NULL,
  title         TEXT    NOT NULL,
  url           TEXT    NOT NULL,
  thumbnail_url TEXT,
  author        TEXT,
  summary       TEXT,
  published_at  INTEGER,
  is_short      INTEGER NOT NULL DEFAULT 0,
  is_completed  INTEGER NOT NULL DEFAULT 0,
  completed_at  INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE (feed_id, external_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS twitch_channels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  login        TEXT    NOT NULL UNIQUE,
  display_name TEXT    NOT NULL,
  avatar_url   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_feed      ON items (feed_id);
CREATE INDEX IF NOT EXISTS idx_items_completed ON items (is_completed, completed_at);
CREATE INDEX IF NOT EXISTS idx_items_published ON items (published_at);
`;

function migrate(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(feeds)').all() as { name?: string }[];
  if (!columns.some((col) => col.name === 'category')) {
    db.exec('ALTER TABLE feeds ADD COLUMN category TEXT;');
  }
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export type { DatabaseSync };
