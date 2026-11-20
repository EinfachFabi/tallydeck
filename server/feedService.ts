import type { DatabaseSync, FeedType } from './db.ts';
import { defaultFetchText, type FetchText } from './http.ts';
import { parseFeedXml } from './feedParser.ts';
import { resolveRssFeed, resolveYouTubeFeed } from './resolvers.ts';
import { parseOpml } from './opml.ts';
import { AppError, errorMessage } from './errors.ts';
import * as repo from './repository.ts';

export interface OpmlImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: { url: string; error: string }[];
}

export interface SyncResult {
  added: number;
  feeds: number;
  errors: { feedId: number; title: string; error: string }[];
  finishedAt: number;
}

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const SYNC_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function createFeedService(db: DatabaseSync, fetchText: FetchText = defaultFetchText, logger?: Logger) {
  let lastSyncAt: number | null = null;
  let running: Promise<SyncResult> | null = null;

  async function fetchFeed(feedUrl: string, type: FeedType) {
    const res = await fetchText(feedUrl);
    return parseFeedXml(res.text, type, res.finalUrl || feedUrl);
  }

  /** Adds a YouTube channel or RSS feed, loads its current items and returns the new feed. */
  async function addFeed(
    type: FeedType,
    input: string,
    category?: string | null,
  ): Promise<{ feed: repo.FeedDto; added: number }> {
    let feedUrl: string;
    let sourceUrl: string;
    let channelId: string | null = null;
    let iconUrl: string | null = null;
    let fallbackTitle: string | null = null;
    let parsed;

    if (type === 'youtube') {
      const resolved = await resolveYouTubeFeed(input, fetchText);
      feedUrl = resolved.feedUrl;
      sourceUrl = resolved.sourceUrl;
      channelId = resolved.channelId;
      iconUrl = resolved.iconUrl;
      fallbackTitle = resolved.pageTitle;
      if (repo.findFeedByUrl(db, type, feedUrl)) {
        throw new AppError('feed_exists', 409, 'This channel has already been added.');
      }
      parsed = await fetchFeed(feedUrl, type);
    } else {
      const resolved = await resolveRssFeed(input, fetchText);
      feedUrl = resolved.feedUrl;
      sourceUrl = resolved.sourceUrl;
      if (repo.findFeedByUrl(db, type, feedUrl)) {
        throw new AppError('feed_exists', 409, 'This feed has already been added.');
      }
      parsed = await parseFeedXml(resolved.xml, type, feedUrl);
      iconUrl = parsed.iconUrl;
    }

    const siteUrl =
      type === 'youtube' && (channelId ?? parsed.channelId)
        ? `https://www.youtube.com/channel/${channelId ?? parsed.channelId}`
        : parsed.siteUrl;

    let title = parsed.title ?? fallbackTitle;
    if (!title) {
      try {
        title = new URL(siteUrl ?? feedUrl).hostname.replace(/^www\./, '');
      } catch {
        title = feedUrl;
      }
    }

    const feedId = repo.insertFeed(db, {
      type,
      title,
      feedUrl,
      sourceUrl,
      siteUrl,
      channelId: channelId ?? parsed.channelId,
      iconUrl,
      category,
    });
    const added = repo.insertItems(db, feedId, parsed.items);
    repo.updateFeedFetchState(db, feedId, null);
    logger?.info(`Added ${type} feed "${title}" with ${added} items`);

    const feed = repo.listFeeds(db, type).find((f) => f.id === feedId) ?? repo.getFeed(db, feedId)!;
    return { feed, added };
  }

  async function syncOne(feed: repo.FeedDto): Promise<{ added: number; error: string | null }> {
    try {
      const parsed = await fetchFeed(feed.feedUrl, feed.type);
      const added = repo.insertItems(db, feed.id, parsed.items);
      repo.updateFeedFetchState(db, feed.id, null);
      return { added, error: null };
    } catch (err) {
      const message = errorMessage(err);
      repo.updateFeedFetchState(db, feed.id, message);
      logger?.warn(`Sync failed for "${feed.title}": ${message}`);
      return { added: 0, error: message };
    }
  }

  async function runSync(feeds: repo.FeedDto[]): Promise<SyncResult> {
    const results = await mapWithConcurrency(feeds, SYNC_CONCURRENCY, syncOne);
    const result: SyncResult = { added: 0, feeds: feeds.length, errors: [], finishedAt: Date.now() };
    results.forEach((r, i) => {
      result.added += r.added;
      if (r.error) result.errors.push({ feedId: feeds[i].id, title: feeds[i].title, error: r.error });
    });
    return result;
  }

  /** Syncs all feeds (optionally of one type). Concurrent calls share the same running sync. */
  async function syncAll(type?: FeedType): Promise<SyncResult> {
    if (running) return running;
    running = (async () => {
      try {
        const result = await runSync(repo.getAllFeeds(db, type));
        lastSyncAt = result.finishedAt;
        if (result.feeds > 0) {
          logger?.info(`Synced ${result.feeds} feeds, ${result.added} new items, ${result.errors.length} errors`);
        }
        return result;
      } finally {
        running = null;
      }
    })();
    return running;
  }

  async function syncFeed(feedId: number): Promise<SyncResult> {
    const feed = repo.getFeed(db, feedId);
    if (!feed) throw new AppError('feed_not_found', 404, 'Feed not found.');
    return runSync([feed]);
  }

  async function importOpml(type: FeedType, opmlXml: string): Promise<OpmlImportResult> {
    const entries = parseOpml(opmlXml);
    if (entries.length === 0) {
      throw new AppError('invalid_opml', 400, 'No feeds found in the OPML file.');
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { url: string; error: string }[] = [];

    for (const entry of entries) {
      const candidateUrl = entry.url.trim();
      if (!candidateUrl) continue;

      if (repo.findFeedByUrl(db, type, candidateUrl)) {
        skipped += 1;
        continue;
      }

      try {
        await addFeed(type, candidateUrl, entry.category);
        imported += 1;
      } catch (err) {
        if (err instanceof AppError && err.code === 'feed_exists') {
          skipped += 1;
          continue;
        }
        // Fallback: if the feed failed to fetch right now, but we have a valid feed URL in the OPML,
        // insert the feed directly so the user doesn't lose the subscription during import.
        const isYouTubeXml =
          type === 'youtube' && /^https?:\/\/(www\.)?youtube\.com\/feeds\/videos\.xml\?(channel_id|playlist_id)=/i.test(candidateUrl);
        const isHttpUrl = /^https?:\/\//i.test(candidateUrl);
        if ((type === 'rss' && isHttpUrl) || isYouTubeXml) {
          if (repo.findFeedByUrl(db, type, candidateUrl)) {
            skipped += 1;
            continue;
          }
          const chMatch = candidateUrl.match(/[?&]channel_id=(UC[\w-]{22})/);
          const fallbackTitle =
            entry.title ||
            (() => {
              try {
                return new URL(entry.siteUrl ?? candidateUrl).hostname.replace(/^www\./, '');
              } catch {
                return candidateUrl;
              }
            })();
          const feedId = repo.insertFeed(db, {
            type,
            title: fallbackTitle,
            feedUrl: candidateUrl,
            sourceUrl: entry.siteUrl ?? candidateUrl,
            siteUrl:
              entry.siteUrl ??
              (chMatch ? `https://www.youtube.com/channel/${chMatch[1]}` : null),
            channelId: chMatch ? chMatch[1] : null,
            iconUrl: null,
            category: entry.category,
          });
          repo.updateFeedFetchState(db, feedId, errorMessage(err));
          imported += 1;
        } else {
          failed += 1;
          errors.push({ url: candidateUrl, error: errorMessage(err) });
        }
      }
    }

    return { imported, skipped, failed, errors };
  }

  function startScheduler(intervalMinutes: number): () => void {
    const tick = () => {
      syncAll().catch((err) => logger?.warn(`Scheduled sync failed: ${errorMessage(err)}`));
    };
    // Initial sync shortly after startup (non-blocking), then on the interval.
    const startup = setTimeout(tick, 3_000);
    const interval = setInterval(tick, intervalMinutes * 60_000);
    return () => {
      clearTimeout(startup);
      clearInterval(interval);
    };
  }

  return {
    addFeed,
    importOpml,
    syncAll,
    syncFeed,
    startScheduler,
    getSyncState: () => ({ lastSyncAt, syncing: running !== null }),
  };
}

export type FeedService = ReturnType<typeof createFeedService>;
