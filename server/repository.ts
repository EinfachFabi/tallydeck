import type { DatabaseSync, FeedType } from './db.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
export const UNCATEGORIZED_TOKEN = '__uncategorized__';

// ---------- Types ----------

export interface NormalizedItem {
  externalId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  author: string | null;
  summary: string | null;
  publishedAt: number | null;
  isShort: boolean;
}

export interface FeedDto {
  id: number;
  type: FeedType;
  title: string;
  feedUrl: string;
  sourceUrl: string | null;
  siteUrl: string | null;
  channelId: string | null;
  iconUrl: string | null;
  category: string | null;
  lastFetchedAt: number | null;
  lastError: string | null;
  createdAt: number;
  unreadCount: number;
  totalCount: number;
}

export interface ItemDto {
  id: number;
  feedId: number;
  feedTitle: string;
  feedIconUrl: string | null;
  feedCategory: string | null;
  externalId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  author: string | null;
  summary: string | null;
  publishedAt: number | null;
  isShort: boolean;
  isCompleted: boolean;
  completedAt: number | null;
  createdAt: number;
}

export interface StatsDto {
  totalCompleted: number;
  completedThisWeek: number;
  completedLastWeek: number;
  avgPerWeek: number;
  pendingCount: number;
  feedCount: number;
  /** Completed items per rolling 7-day window, oldest first; last entry = current week. */
  weekly: number[];
}

export interface NewFeed {
  type: FeedType;
  title: string;
  feedUrl: string;
  sourceUrl: string | null;
  siteUrl: string | null;
  channelId: string | null;
  iconUrl: string | null;
  category?: string | null;
}

export interface ItemFilter {
  type: FeedType;
  feedId?: number;
  category?: string;
  hideShorts?: boolean;
}

// ---------- Row mapping ----------

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function normalizeCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 40) : null;
}

function toFeedDto(row: Row): FeedDto {
  return {
    id: Number(row.id),
    type: row.type as FeedType,
    title: String(row.title),
    feedUrl: String(row.feed_url),
    sourceUrl: str(row.source_url),
    siteUrl: str(row.site_url),
    channelId: str(row.channel_id),
    iconUrl: str(row.icon_url),
    category: str(row.category),
    lastFetchedAt: num(row.last_fetched_at),
    lastError: str(row.last_error),
    createdAt: Number(row.created_at),
    unreadCount: Number(row.unread_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
  };
}

function toItemDto(row: Row): ItemDto {
  return {
    id: Number(row.id),
    feedId: Number(row.feed_id),
    feedTitle: String(row.feed_title ?? ''),
    feedIconUrl: str(row.feed_icon_url),
    feedCategory: str(row.feed_category),
    externalId: String(row.external_id),
    title: String(row.title),
    url: String(row.url),
    thumbnailUrl: str(row.thumbnail_url),
    author: str(row.author),
    summary: str(row.summary),
    publishedAt: num(row.published_at),
    isShort: Number(row.is_short) === 1,
    isCompleted: Number(row.is_completed) === 1,
    completedAt: num(row.completed_at),
    createdAt: Number(row.created_at),
  };
}

function filterClause(filter: ItemFilter, alias = 'i'): { sql: string; params: (string | number)[] } {
  const parts = ['f.type = ?'];
  const params: (string | number)[] = [filter.type];
  if (filter.feedId !== undefined) {
    parts.push(`${alias}.feed_id = ?`);
    params.push(filter.feedId);
  }
  if (filter.category !== undefined && filter.category !== '') {
    if (filter.category === UNCATEGORIZED_TOKEN) {
      parts.push("(f.category IS NULL OR f.category = '')");
    } else {
      parts.push('LOWER(f.category) = LOWER(?)');
      params.push(filter.category);
    }
  }
  if (filter.hideShorts) {
    parts.push(`${alias}.is_short = 0`);
  }
  return { sql: parts.join(' AND '), params };
}

// ---------- Feeds ----------

export function listFeeds(db: DatabaseSync, type: FeedType, hideShorts = false): FeedDto[] {
  const shortsFilter = hideShorts ? 'AND i.is_short = 0' : '';
  const rows = db
    .prepare(
      `SELECT f.*,
              COALESCE(SUM(CASE WHEN i.is_completed = 0 ${shortsFilter} THEN 1 ELSE 0 END), 0) AS unread_count,
              COUNT(i.id) AS total_count
         FROM feeds f
         LEFT JOIN items i ON i.feed_id = f.id
        WHERE f.type = ?
        GROUP BY f.id
        ORDER BY COALESCE(f.category, 'zzzz') COLLATE NOCASE ASC, f.title COLLATE NOCASE ASC`,
    )
    .all(type) as Row[];
  return rows.map(toFeedDto);
}

export function getFeed(db: DatabaseSync, id: number): FeedDto | null {
  const row = db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) as Row | undefined;
  return row ? toFeedDto(row) : null;
}

export function getAllFeeds(db: DatabaseSync, type?: FeedType): FeedDto[] {
  const rows = (
    type
      ? db.prepare('SELECT * FROM feeds WHERE type = ?').all(type)
      : db.prepare('SELECT * FROM feeds').all()
  ) as Row[];
  return rows.map(toFeedDto);
}

export function findFeedByUrl(db: DatabaseSync, type: FeedType, feedUrl: string): FeedDto | null {
  const row = db
    .prepare('SELECT * FROM feeds WHERE type = ? AND feed_url = ?')
    .get(type, feedUrl) as Row | undefined;
  return row ? toFeedDto(row) : null;
}

export function insertFeed(db: DatabaseSync, feed: NewFeed, now = Date.now()): number {
  const result = db
    .prepare(
      `INSERT INTO feeds (type, title, feed_url, source_url, site_url, channel_id, icon_url, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      feed.type,
      feed.title,
      feed.feedUrl,
      feed.sourceUrl,
      feed.siteUrl,
      feed.channelId,
      feed.iconUrl,
      normalizeCategory(feed.category),
      now,
    );
  return Number(result.lastInsertRowid);
}

export function updateFeedCategory(db: DatabaseSync, id: number, category: string | null): FeedDto | null {
  const existing = getFeed(db, id);
  if (!existing) return null;
  db.prepare('UPDATE feeds SET category = ? WHERE id = ?').run(normalizeCategory(category), id);
  return listFeeds(db, existing.type).find((f) => f.id === id) ?? getFeed(db, id);
}

export function deleteFeed(db: DatabaseSync, id: number): boolean {
  const result = db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

export function updateFeedFetchState(db: DatabaseSync, id: number, error: string | null, now = Date.now()): void {
  db.prepare('UPDATE feeds SET last_fetched_at = ?, last_error = ? WHERE id = ?').run(now, error, id);
}

export function updateFeedMeta(
  db: DatabaseSync,
  id: number,
  meta: { title?: string | null; iconUrl?: string | null; siteUrl?: string | null },
): void {
  db.prepare(
    `UPDATE feeds
        SET title    = COALESCE(?, title),
            icon_url = COALESCE(?, icon_url),
            site_url = COALESCE(?, site_url)
      WHERE id = ?`,
  ).run(meta.title ?? null, meta.iconUrl ?? null, meta.siteUrl ?? null, id);
}

// ---------- Items ----------

/**
 * Inserts new items, ignoring items that already exist (same feed + external id).
 * Existing items keep their completion state. Returns number of newly inserted items.
 */
export function insertItems(db: DatabaseSync, feedId: number, items: NormalizedItem[], now = Date.now()): number {
  if (items.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO items
       (feed_id, external_id, title, url, thumbnail_url, author, summary, published_at, is_short, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  db.exec('BEGIN');
  try {
    for (const item of items) {
      const result = stmt.run(
        feedId,
        item.externalId,
        item.title,
        item.url,
        item.thumbnailUrl,
        item.author,
        item.summary,
        item.publishedAt,
        item.isShort ? 1 : 0,
        now,
      );
      added += Number(result.changes);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return added;
}

const ITEM_SELECT = `
  SELECT i.*, f.title AS feed_title, f.icon_url AS feed_icon_url, f.category AS feed_category
    FROM items i
    JOIN feeds f ON f.id = i.feed_id`;

export function listUncompleted(db: DatabaseSync, filter: ItemFilter, limit = 500): ItemDto[] {
  const where = filterClause(filter);
  const rows = db
    .prepare(
      `${ITEM_SELECT}
        WHERE ${where.sql} AND i.is_completed = 0
        ORDER BY COALESCE(i.published_at, i.created_at) DESC, i.id DESC
        LIMIT ?`,
    )
    .all(...where.params, limit) as Row[];
  return rows.map(toItemDto);
}

/**
 * Lists completed (watched / read) items from the last 7 days only.
 * Older completed items remain in the database for deduplication and lifetime statistics.
 */
export function listCompleted(
  db: DatabaseSync,
  filter: ItemFilter,
  limit = 100,
  now = Date.now(),
): { items: ItemDto[]; total: number } {
  const where = filterClause(filter);
  const cutoff = now - WEEK_MS;
  const rows = db
    .prepare(
      `${ITEM_SELECT}
        WHERE ${where.sql} AND i.is_completed = 1 AND i.completed_at >= ?
        ORDER BY i.completed_at DESC, i.id DESC
        LIMIT ?`,
    )
    .all(...where.params, cutoff, limit) as Row[];
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM items i JOIN feeds f ON f.id = i.feed_id
        WHERE ${where.sql} AND i.is_completed = 1 AND i.completed_at >= ?`,
    )
    .get(...where.params, cutoff) as Row;
  return { items: rows.map(toItemDto), total: Number(totalRow.c) };
}

export function getItem(db: DatabaseSync, id: number): ItemDto | null {
  const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id) as Row | undefined;
  return row ? toItemDto(row) : null;
}

export function setItemCompleted(db: DatabaseSync, id: number, completed: boolean, now = Date.now()): ItemDto | null {
  db.prepare('UPDATE items SET is_completed = ?, completed_at = ? WHERE id = ?').run(
    completed ? 1 : 0,
    completed ? now : null,
    id,
  );
  return getItem(db, id);
}

export function completeAll(db: DatabaseSync, filter: ItemFilter, now = Date.now()): number {
  const where = filterClause(filter, 'items');
  const result = db
    .prepare(
      `UPDATE items SET is_completed = 1, completed_at = ?
        WHERE is_completed = 0
          AND id IN (SELECT items.id FROM items JOIN feeds f ON f.id = items.feed_id WHERE ${where.sql})`,
    )
    .run(now, ...where.params);
  return Number(result.changes);
}

// ---------- Stats ----------

export function getStats(db: DatabaseSync, filter: ItemFilter, now = Date.now(), weeks = 8): StatsDto {
  const where = filterClause(filter);

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN i.is_completed = 1 THEN 1 ELSE 0 END), 0) AS completed,
         COALESCE(SUM(CASE WHEN i.is_completed = 0 THEN 1 ELSE 0 END), 0) AS pending,
         MIN(CASE WHEN i.is_completed = 1 THEN i.completed_at END)         AS first_completed
       FROM items i JOIN feeds f ON f.id = i.feed_id
      WHERE ${where.sql}`,
    )
    .get(...where.params) as Row;

  const since = now - weeks * WEEK_MS;
  const recent = db
    .prepare(
      `SELECT i.completed_at AS t FROM items i JOIN feeds f ON f.id = i.feed_id
        WHERE ${where.sql} AND i.is_completed = 1 AND i.completed_at > ?`,
    )
    .all(...where.params, since) as Row[];

  const weekly = new Array<number>(weeks).fill(0);
  for (const r of recent) {
    const age = now - Number(r.t);
    const bucket = Math.floor(age / WEEK_MS);
    if (bucket >= 0 && bucket < weeks) weekly[weeks - 1 - bucket] += 1;
  }

  const feedCountRow = db.prepare('SELECT COUNT(*) AS c FROM feeds WHERE type = ?').get(filter.type) as Row;

  const totalCompleted = Number(totals.completed);
  const firstCompleted = num(totals.first_completed);
  const weeksActive = firstCompleted === null ? 1 : Math.max(1, (now - firstCompleted) / WEEK_MS);

  return {
    totalCompleted,
    completedThisWeek: weekly[weeks - 1],
    completedLastWeek: weekly[weeks - 2] ?? 0,
    avgPerWeek: Math.round((totalCompleted / weeksActive) * 10) / 10,
    pendingCount: Number(totals.pending),
    feedCount: Number(feedCountRow.c),
    weekly,
  };
}
