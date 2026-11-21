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
  isArchived?: boolean;
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

// ---------- Topics ----------
//
// Topics are the feeds' `category` values. Additionally a small registry in the settings table
// stores topic colors and topics that currently have no feeds (created in the settings menu).

/** Number of preset topic colors (must match the client palette in src/utils/topicColor.ts). */
export const TOPIC_COLOR_COUNT = 16;

/** Palette index (0..15), custom #rrggbb hex color, or null = automatic color. */
export type TopicColor = number | string | null;

export interface TopicRecord {
  name: string;
  color: TopicColor;
}

export interface TopicDto extends TopicRecord {
  youtubeCount: number;
  rssCount: number;
}

const topicKey = (name: string) => name.trim().toLocaleLowerCase();

export function normalizeTopicColor(value: unknown): TopicColor {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const [, r, g, b] = trimmed.toLowerCase();
      return `#${r}${r}${g}${g}${b}${b}`;
    }
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < TOPIC_COLOR_COUNT ? n : null;
}

export function readTopicRegistry(db: DatabaseSync): TopicRecord[] {
  const raw = getSettingValue(db, 'topics');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: TopicRecord[] = [];
    for (const entry of parsed) {
      const name = normalizeCategory((entry as TopicRecord)?.name);
      if (!name || seen.has(topicKey(name))) continue;
      seen.add(topicKey(name));
      result.push({ name, color: normalizeTopicColor((entry as TopicRecord).color) });
    }
    return result;
  } catch {
    return [];
  }
}

function writeTopicRegistry(db: DatabaseSync, topics: TopicRecord[]): void {
  setSettingValue(db, 'topics', JSON.stringify(topics));
}

export function listTopics(db: DatabaseSync): TopicDto[] {
  const map = new Map<string, TopicDto>();
  for (const t of readTopicRegistry(db)) {
    map.set(topicKey(t.name), { ...t, youtubeCount: 0, rssCount: 0 });
  }
  const rows = db
    .prepare('SELECT category, type, COUNT(*) AS c FROM feeds WHERE category IS NOT NULL GROUP BY category, type')
    .all() as Row[];
  for (const row of rows) {
    const name = String(row.category);
    const key = topicKey(name);
    let topic = map.get(key);
    if (!topic) {
      topic = { name, color: null, youtubeCount: 0, rssCount: 0 };
      map.set(key, topic);
    }
    if (row.type === 'youtube') topic.youtubeCount += Number(row.c);
    else topic.rssCount += Number(row.c);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function feedIdsWithTopic(db: DatabaseSync, name: string): number[] {
  const key = topicKey(name);
  const rows = db.prepare('SELECT id, category FROM feeds WHERE category IS NOT NULL').all() as Row[];
  return rows.filter((r) => topicKey(String(r.category)) === key).map((r) => Number(r.id));
}

function topicExists(db: DatabaseSync, name: string): boolean {
  const key = topicKey(name);
  return readTopicRegistry(db).some((t) => topicKey(t.name) === key) || feedIdsWithTopic(db, name).length > 0;
}

/** Creates a topic (or updates its color if it already exists). Returns null for an empty name. */
export function createTopic(db: DatabaseSync, rawName: unknown, color?: unknown): TopicDto[] | null {
  const name = normalizeCategory(rawName);
  if (!name) return null;
  const registry = readTopicRegistry(db);
  const existing = registry.find((t) => topicKey(t.name) === topicKey(name));
  if (existing) {
    if (color !== undefined) existing.color = normalizeTopicColor(color);
  } else {
    registry.push({ name, color: normalizeTopicColor(color) });
  }
  writeTopicRegistry(db, registry);
  return listTopics(db);
}

/**
 * Renames a topic (all feeds follow; renaming onto an existing topic merges both) and/or sets its color.
 * Returns null if the topic does not exist.
 */
export function updateTopic(
  db: DatabaseSync,
  name: string,
  patch: { newName?: unknown; color?: unknown },
): TopicDto[] | null {
  if (!topicExists(db, name)) return null;
  const key = topicKey(name);
  let registry = readTopicRegistry(db);
  const current = registry.find((t) => topicKey(t.name) === key) ?? { name, color: null };
  if (patch.color !== undefined) current.color = normalizeTopicColor(patch.color);

  const newName = patch.newName === undefined ? null : normalizeCategory(patch.newName);
  if (newName && newName !== current.name) {
    db.exec('BEGIN');
    try {
      const stmt = db.prepare('UPDATE feeds SET category = ? WHERE id = ?');
      for (const id of feedIdsWithTopic(db, name)) stmt.run(newName, id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    registry = registry.filter((t) => topicKey(t.name) !== key);
    const target = registry.find((t) => topicKey(t.name) === topicKey(newName));
    if (target) {
      target.name = newName;
      if (target.color === null || patch.color !== undefined) target.color = current.color;
    } else {
      registry.push({ name: newName, color: current.color });
    }
  } else if (!registry.includes(current)) {
    registry.push(current);
  }

  writeTopicRegistry(db, registry);
  return listTopics(db);
}

/** Deletes a topic. Feeds are kept but lose their topic. Returns false if the topic does not exist. */
export function deleteTopic(db: DatabaseSync, name: string): boolean {
  if (!topicExists(db, name)) return false;
  const stmt = db.prepare('UPDATE feeds SET category = NULL WHERE id = ?');
  for (const id of feedIdsWithTopic(db, name)) stmt.run(id);
  writeTopicRegistry(
    db,
    readTopicRegistry(db).filter((t) => topicKey(t.name) !== topicKey(name)),
  );
  return true;
}

function mergeTopicRegistry(db: DatabaseSync, incoming: unknown): void {
  if (!Array.isArray(incoming)) return;
  const registry = readTopicRegistry(db);
  for (const entry of incoming) {
    const name = normalizeCategory((entry as TopicRecord)?.name);
    if (!name) continue;
    const color = normalizeTopicColor((entry as TopicRecord).color);
    const existing = registry.find((t) => topicKey(t.name) === topicKey(name));
    if (existing) {
      if (color !== null) existing.color = color;
    } else {
      registry.push({ name, color });
    }
  }
  writeTopicRegistry(db, registry);
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

export function listUncompleted(db: DatabaseSync, filter: ItemFilter, limit = 100): ItemDto[] {
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
 * Lists completed (watched / read) items from the last N days (default: 7 days, max: 30 days).
 * Older completed items remain in the database for deduplication and lifetime statistics.
 */
export function listCompleted(
  db: DatabaseSync,
  filter: ItemFilter,
  limit = 100,
  completedDays = 7,
  now = Date.now(),
): { items: ItemDto[]; total: number } {
  const where = filterClause(filter);
  const days = Math.min(Math.max(Math.round(completedDays) || 7, 1), 30);
  const cutoff = now - days * DAY_MS;
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

// ---------- Server Settings & Auto-Cleanup ----------

export const VALID_POLL_INTERVALS = [0, 5, 15, 30, 60] as const;
export type PollIntervalMinutes = (typeof VALID_POLL_INTERVALS)[number];

export interface ServerSettingsDto {
  pollIntervalMinutes: PollIntervalMinutes;
  autoArchiveEnabled: boolean;
  autoArchiveDays: number;
}

function getSettingValue(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
  return row ? str(row.value) : null;
}

function setSettingValue(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function normalizePollInterval(value: unknown, fallback: PollIntervalMinutes = 15): PollIntervalMinutes {
  const n = Number(value);
  if ((VALID_POLL_INTERVALS as readonly number[]).includes(n)) {
    return n as PollIntervalMinutes;
  }
  return fallback;
}

export function getServerSettings(db: DatabaseSync, defaultPollInterval = 15): ServerSettingsDto {
  const rawPoll = getSettingValue(db, 'pollIntervalMinutes');
  const rawAutoEnabled = getSettingValue(db, 'autoArchiveEnabled');
  const rawAutoDays = getSettingValue(db, 'autoArchiveDays');

  const pollIntervalMinutes =
    rawPoll !== null
      ? normalizePollInterval(rawPoll, normalizePollInterval(defaultPollInterval, 15))
      : normalizePollInterval(defaultPollInterval, 15);
  const autoArchiveEnabled = rawAutoEnabled === 'true' || rawAutoEnabled === '1';
  const parsedDays = Number(rawAutoDays);
  const autoArchiveDays = Number.isFinite(parsedDays) && parsedDays >= 1 ? Math.min(Math.round(parsedDays), 365) : 30;

  return {
    pollIntervalMinutes,
    autoArchiveEnabled,
    autoArchiveDays,
  };
}

export function updateServerSettings(
  db: DatabaseSync,
  patch: Partial<ServerSettingsDto>,
  defaultPollInterval = 15,
): ServerSettingsDto {
  const current = getServerSettings(db, defaultPollInterval);
  const next: ServerSettingsDto = {
    pollIntervalMinutes:
      patch.pollIntervalMinutes !== undefined
        ? normalizePollInterval(patch.pollIntervalMinutes, current.pollIntervalMinutes)
        : current.pollIntervalMinutes,
    autoArchiveEnabled:
      typeof patch.autoArchiveEnabled === 'boolean' ? patch.autoArchiveEnabled : current.autoArchiveEnabled,
    autoArchiveDays:
      patch.autoArchiveDays !== undefined && Number.isFinite(Number(patch.autoArchiveDays))
        ? Math.min(Math.max(Math.round(Number(patch.autoArchiveDays)), 1), 365)
        : current.autoArchiveDays,
  };

  setSettingValue(db, 'pollIntervalMinutes', String(next.pollIntervalMinutes));
  setSettingValue(db, 'autoArchiveEnabled', next.autoArchiveEnabled ? 'true' : 'false');
  setSettingValue(db, 'autoArchiveDays', String(next.autoArchiveDays));
  return next;
}

/**
 * Automatically archives unread items (`is_completed = 0`) whose published_at (or created_at)
 * is older than `days` days by setting `is_completed = 2` (archived without being watched/read).
 *
 * - Newer unread items (e.g. from today or within the last `days` days) stay untouched in the inbox.
 * - Already watched/read items (`is_completed = 1`) stay untouched and keep their stats.
 * - Archived items (`is_completed = 2`) are removed from the inbox, stay in SQLite so background sync
 *   never re-imports them, and do NOT count toward watched/read statistics or appear in the right table.
 */
export function archiveOldUncompleted(db: DatabaseSync, days: number, now = Date.now()): number {
  const clampedDays = Math.min(Math.max(Math.round(days), 1), 365);
  const cutoff = now - clampedDays * DAY_MS;
  const result = db
    .prepare(
      `UPDATE items
          SET is_completed = 2,
              completed_at = NULL
        WHERE is_completed = 0
          AND COALESCE(published_at, created_at) < ?`,
    )
    .run(cutoff);
  return Number(result.changes);
}

// ---------- Full Database Backup & Restore ----------

export interface BackupFeedRecord {
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
}

export interface BackupItemRecord {
  feedType: FeedType;
  feedUrl: string;
  externalId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  author: string | null;
  summary: string | null;
  publishedAt: number | null;
  isShort: boolean;
  isCompleted: boolean;
  isArchived?: boolean;
  completedAt: number | null;
  createdAt: number;
}

export interface FullBackupPayload {
  app: 'tallydeck';
  version: number;
  exportedAt: number;
  serverSettings?: Partial<ServerSettingsDto>;
  clientSettings?: Record<string, unknown>;
  /** Topic colors and topics without feeds (optional, added in 0.3). */
  topics?: TopicRecord[];
  feeds: BackupFeedRecord[];
  items: BackupItemRecord[];
}

export interface RestoreBackupResult {
  feedsRestored: number;
  itemsRestored: number;
  serverSettings: ServerSettingsDto;
}

export function exportFullBackup(db: DatabaseSync, defaultPollInterval = 15, now = Date.now()): FullBackupPayload {
  const feedRows = db.prepare('SELECT * FROM feeds ORDER BY id ASC').all() as Row[];
  const itemRows = db
    .prepare(
      `SELECT i.*, f.type AS feed_type, f.feed_url AS feed_url
         FROM items i
         JOIN feeds f ON f.id = i.feed_id
        ORDER BY i.id ASC`,
    )
    .all() as Row[];

  const feeds: BackupFeedRecord[] = feedRows.map((row) => ({
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
  }));

  const items: BackupItemRecord[] = itemRows.map((row) => ({
    feedType: row.feed_type as FeedType,
    feedUrl: String(row.feed_url),
    externalId: String(row.external_id),
    title: String(row.title),
    url: String(row.url),
    thumbnailUrl: str(row.thumbnail_url),
    author: str(row.author),
    summary: str(row.summary),
    publishedAt: num(row.published_at),
    isShort: Number(row.is_short) === 1,
    isCompleted: Number(row.is_completed) === 1,
    isArchived: Number(row.is_completed) === 2,
    completedAt: num(row.completed_at),
    createdAt: Number(row.created_at),
  }));

  return {
    app: 'tallydeck',
    version: 1,
    exportedAt: now,
    serverSettings: getServerSettings(db, defaultPollInterval),
    topics: readTopicRegistry(db),
    feeds,
    items,
  };
}

export function restoreFullBackup(
  db: DatabaseSync,
  payload: FullBackupPayload,
  defaultPollInterval = 15,
  now = Date.now(),
): RestoreBackupResult {
  const upsertFeedStmt = db.prepare(
    `INSERT INTO feeds (type, title, feed_url, source_url, site_url, channel_id, icon_url, category, last_fetched_at, last_error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(type, feed_url) DO UPDATE SET
       title      = excluded.title,
       source_url = COALESCE(excluded.source_url, feeds.source_url),
       site_url   = COALESCE(excluded.site_url, feeds.site_url),
       channel_id = COALESCE(excluded.channel_id, feeds.channel_id),
       icon_url   = COALESCE(excluded.icon_url, feeds.icon_url),
       category   = COALESCE(excluded.category, feeds.category)`,
  );

  const selectFeedIdStmt = db.prepare('SELECT id FROM feeds WHERE type = ? AND feed_url = ?');

  const upsertItemStmt = db.prepare(
    `INSERT INTO items
       (feed_id, external_id, title, url, thumbnail_url, author, summary, published_at, is_short, is_completed, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(feed_id, external_id) DO UPDATE SET
       is_completed = CASE
         WHEN items.is_completed = 1 OR excluded.is_completed = 1 THEN 1
         WHEN items.is_completed = 2 OR excluded.is_completed = 2 THEN 2
         ELSE 0
       END,
       completed_at = COALESCE(items.completed_at, excluded.completed_at)`,
  );

  let feedsRestored = 0;
  let itemsRestored = 0;
  const feedIdMap = new Map<string, number>();

  db.exec('BEGIN');
  try {
    for (const f of payload.feeds ?? []) {
      if ((f.type !== 'youtube' && f.type !== 'rss') || typeof f.feedUrl !== 'string' || !f.feedUrl.trim()) {
        continue;
      }
      const feedUrl = f.feedUrl.trim();
      upsertFeedStmt.run(
        f.type,
        typeof f.title === 'string' && f.title.trim() ? f.title.trim() : feedUrl,
        feedUrl,
        str(f.sourceUrl),
        str(f.siteUrl),
        str(f.channelId),
        str(f.iconUrl),
        normalizeCategory(f.category),
        num(f.lastFetchedAt),
        str(f.lastError),
        Number.isFinite(Number(f.createdAt)) ? Number(f.createdAt) : now,
      );
      const row = selectFeedIdStmt.get(f.type, feedUrl) as Row | undefined;
      if (row) {
        feedIdMap.set(`${f.type}|${feedUrl}`, Number(row.id));
        feedsRestored += 1;
      }
    }

    for (const item of payload.items ?? []) {
      if (
        (item.feedType !== 'youtube' && item.feedType !== 'rss') ||
        typeof item.feedUrl !== 'string' ||
        typeof item.externalId !== 'string' ||
        !item.externalId.trim()
      ) {
        continue;
      }
      const key = `${item.feedType}|${item.feedUrl.trim()}`;
      let feedId = feedIdMap.get(key);
      if (feedId === undefined) {
        const row = selectFeedIdStmt.get(item.feedType, item.feedUrl.trim()) as Row | undefined;
        if (row) {
          feedId = Number(row.id);
          feedIdMap.set(key, feedId);
        }
      }
      if (feedId === undefined) continue;

      const completionState = item.isCompleted ? 1 : item.isArchived ? 2 : 0;
      upsertItemStmt.run(
        feedId,
        item.externalId.trim(),
        typeof item.title === 'string' && item.title.trim() ? item.title.trim() : item.externalId,
        typeof item.url === 'string' ? item.url : '',
        str(item.thumbnailUrl),
        str(item.author),
        str(item.summary),
        num(item.publishedAt),
        item.isShort ? 1 : 0,
        completionState,
        item.isCompleted ? (num(item.completedAt) ?? now) : null,
        Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : now,
      );
      itemsRestored += 1;
    }

    if (payload.serverSettings) {
      updateServerSettings(db, payload.serverSettings, defaultPollInterval);
    }
    mergeTopicRegistry(db, payload.topics);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const serverSettings = getServerSettings(db, defaultPollInterval);
  if (serverSettings.autoArchiveEnabled) {
    archiveOldUncompleted(db, serverSettings.autoArchiveDays, now);
  }

  return {
    feedsRestored,
    itemsRestored,
    serverSettings,
  };
}
