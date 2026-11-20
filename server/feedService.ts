import type { DatabaseSync, FeedType } from './db.ts';
import { defaultFetchText, type FetchText } from './http.ts';
import { parseFeedXml } from './feedParser.ts';
import { resolveRssFeed, resolveYouTubeFeed } from './resolvers.ts';
import { AppError, errorMessage } from './errors.ts';
import * as repo from './repository.ts';

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
    syncAll,
    syncFeed,
    startScheduler,
    getSyncState: () => ({ lastSyncAt, syncing: running !== null }),
  };
}

export type FeedService = ReturnType<typeof createFeedService>;
