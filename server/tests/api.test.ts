import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DatabaseSync } from '../db.ts';
import { DAY_MS } from '../repository.ts';
import { createFeedService } from '../feedService.ts';
import { buildApp } from '../app.ts';
import { compareVersions, createVersionService } from '../versionService.ts';
import type { FetchText } from '../http.ts';
import { CHANNEL_ID, YOUTUBE_CHANNEL_HTML, rssFeedXml, youtubeFeedXml } from './fixtures.ts';

const YT_FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const RSS_FEED = 'https://news.example.com/feed.xml';

let routes: Record<string, string>;
let db: DatabaseSync;
let app: FastifyInstance;

const fetchText: FetchText = async (url) => {
  if (!(url in routes)) throw new Error(`HTTP 404 for ${url}`);
  return { text: routes[url], finalUrl: url, contentType: 'text/xml' };
};

beforeEach(async () => {
  routes = {
    'https://www.youtube.com/@fireship': YOUTUBE_CHANNEL_HTML,
    [YT_FEED]: youtubeFeedXml([
      { id: 'vid00000001', title: 'Video 1', published: '2026-11-15T10:00:00Z' },
      { id: 'vid00000002', title: 'Video 2', published: '2026-11-16T10:00:00Z' },
      { id: 'short000001', title: 'Short 1', published: '2026-11-17T10:00:00Z', short: true },
    ]),
    [RSS_FEED]: rssFeedXml([
      { guid: 'a1', title: 'Article 1', date: 'Mon, 16 Nov 2026 08:00:00 GMT' },
      { guid: 'a2', title: 'Article 2', date: 'Tue, 17 Nov 2026 08:00:00 GMT' },
    ]),
  };
  db = openDatabase(':memory:');
  app = await buildApp({ db, feedService: createFeedService(db, fetchText) });
});

async function addYouTube() {
  const res = await app.inject({ method: 'POST', url: '/api/feeds', payload: { type: 'youtube', url: '@fireship' } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}

async function getItems(query = 'type=youtube') {
  const res = await app.inject({ method: 'GET', url: `/api/items?${query}` });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

test('adds a YouTube channel via @handle and loads its videos', async () => {
  const { feed, added } = await addYouTube();
  assert.equal(feed.title, 'Fireship');
  assert.equal(feed.feedUrl, YT_FEED);
  assert.equal(feed.iconUrl, 'https://yt3.googleusercontent.com/avatar=s900');
  assert.equal(added, 3);

  const data = await getItems();
  assert.equal(data.uncompleted.length, 3);
  assert.equal(data.uncompleted[0].title, 'Short 1', 'newest first');
  assert.equal(data.completed.length, 0);
  assert.equal(data.stats.feedCount, 1);
  assert.equal(data.stats.pendingCount, 3);
});

test('hideShorts filters YouTube Shorts', async () => {
  await addYouTube();
  const data = await getItems('type=youtube&hideShorts=true');
  assert.equal(data.uncompleted.length, 2);
  assert.ok(data.uncompleted.every((i: { isShort: boolean }) => !i.isShort));
});

test('rejects duplicate channels', async () => {
  await addYouTube();
  const res = await app.inject({
    method: 'POST',
    url: '/api/feeds',
    payload: { type: 'youtube', url: `https://www.youtube.com/channel/${CHANNEL_ID}` },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, 'feed_exists');
});

test('marking as watched moves an item to the right table, undo moves it back, stats update', async () => {
  await addYouTube();
  const before = await getItems();
  const target = before.uncompleted[1];

  const patch = await app.inject({ method: 'PATCH', url: `/api/items/${target.id}`, payload: { completed: true } });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().item.isCompleted, true);
  assert.ok(patch.json().item.completedAt > 0);

  const after = await getItems();
  assert.equal(after.uncompleted.length, 2);
  assert.equal(after.completed.length, 1);
  assert.equal(after.completed[0].id, target.id);
  assert.equal(after.stats.totalCompleted, 1);
  assert.equal(after.stats.completedThisWeek, 1);
  assert.equal(after.stats.weekly.at(-1), 1);
  assert.equal(after.stats.pendingCount, 2);

  await app.inject({ method: 'PATCH', url: `/api/items/${target.id}`, payload: { completed: false } });
  const undone = await getItems();
  assert.equal(undone.uncompleted.length, 3);
  assert.equal(undone.completed.length, 0);
});

test('sync adds only new items and keeps completion state (deduplication)', async () => {
  await addYouTube();
  const first = await getItems();
  const watched = first.uncompleted.find((i: { title: string }) => i.title === 'Video 1');
  await app.inject({ method: 'PATCH', url: `/api/items/${watched.id}`, payload: { completed: true } });

  // Same feed again + one new video
  routes[YT_FEED] = youtubeFeedXml([
    { id: 'vid00000001', title: 'Video 1', published: '2026-11-15T10:00:00Z' },
    { id: 'vid00000002', title: 'Video 2', published: '2026-11-16T10:00:00Z' },
    { id: 'short000001', title: 'Short 1', published: '2026-11-17T10:00:00Z', short: true },
    { id: 'vid00000003', title: 'Brand new video', published: '2026-11-18T10:00:00Z' },
  ]);
  const sync = await app.inject({ method: 'POST', url: '/api/feeds/sync', payload: { type: 'youtube' } });
  assert.equal(sync.statusCode, 200);
  assert.equal(sync.json().added, 1);

  const again = await app.inject({ method: 'POST', url: '/api/feeds/sync', payload: {} });
  assert.equal(again.json().added, 0, 'second sync adds nothing');

  const data = await getItems();
  assert.equal(data.uncompleted.length, 3);
  assert.equal(data.uncompleted[0].title, 'Brand new video');
  assert.equal(data.completed.length, 1);
  assert.equal(data.completed[0].title, 'Video 1');
});

test('sync records feed errors without failing', async () => {
  await addYouTube();
  delete routes[YT_FEED];
  const sync = await app.inject({ method: 'POST', url: '/api/feeds/sync', payload: {} });
  assert.equal(sync.json().errors.length, 1);
  const feeds = (await app.inject({ method: 'GET', url: '/api/feeds?type=youtube' })).json().feeds;
  assert.match(feeds[0].lastError, /404/);
});

test('RSS feeds work the same way, with channel filter and complete-all', async () => {
  const add = await app.inject({ method: 'POST', url: '/api/feeds', payload: { type: 'rss', url: RSS_FEED } });
  assert.equal(add.statusCode, 201, add.body);
  const feedId = add.json().feed.id;

  let data = await getItems(`type=rss&feedId=${feedId}`);
  assert.equal(data.uncompleted.length, 2);
  assert.equal(data.uncompleted[0].title, 'Article 2');

  // YouTube page is isolated from RSS
  assert.equal((await getItems('type=youtube')).uncompleted.length, 0);

  const all = await app.inject({ method: 'POST', url: '/api/items/complete-all', payload: { type: 'rss', feedId } });
  assert.equal(all.json().updated, 2);
  data = await getItems('type=rss');
  assert.equal(data.uncompleted.length, 0);
  assert.equal(data.completedTotal, 2);
  assert.equal(data.stats.totalCompleted, 2);
});

test('deleting a feed removes its items', async () => {
  const { feed } = await addYouTube();
  const del = await app.inject({ method: 'DELETE', url: `/api/feeds/${feed.id}` });
  assert.equal(del.statusCode, 204);
  const data = await getItems();
  assert.equal(data.uncompleted.length, 0);
  assert.equal(data.stats.feedCount, 0);
});

test('validates input', async () => {
  const badType = await app.inject({ method: 'GET', url: '/api/items?type=foo' });
  assert.equal(badType.statusCode, 400);
  const badUrl = await app.inject({ method: 'POST', url: '/api/feeds', payload: { type: 'youtube', url: 'https://example.com' } });
  assert.equal(badUrl.statusCode, 400);
  assert.equal(badUrl.json().error, 'invalid_url');
  const unknown = await app.inject({ method: 'GET', url: '/api/nope' });
  assert.equal(unknown.statusCode, 404);
});

test('right table (completed) only shows items from the last 7 days while preserving total stats and dedup', async () => {
  await addYouTube();
  const initial = await getItems();
  const recentItem = initial.uncompleted[0];
  const oldItem = initial.uncompleted[1];

  await app.inject({ method: 'PATCH', url: `/api/items/${recentItem.id}`, payload: { completed: true } });
  await app.inject({ method: 'PATCH', url: `/api/items/${oldItem.id}`, payload: { completed: true } });

  // Backdate oldItem completion to 8 days ago
  const eightDaysAgo = Date.now() - 8 * DAY_MS;
  db.prepare('UPDATE items SET completed_at = ? WHERE id = ?').run(eightDaysAgo, oldItem.id);

  const after = await getItems();
  assert.equal(after.completed.length, 1, 'only item from last 7 days is shown in right table');
  assert.equal(after.completedTotal, 1);
  assert.equal(after.completed[0].id, recentItem.id);
  assert.equal(after.stats.totalCompleted, 2, 'lifetime totalCompleted still counts both');

  // Re-syncing the feed must not re-add the 8-day-old completed item to the left table
  await app.inject({ method: 'POST', url: '/api/feeds/sync', payload: { type: 'youtube' } });
  const afterSync = await getItems();
  assert.equal(afterSync.uncompleted.length, 1);
});

test('supports grouping and filtering feeds and items by topic/category', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/feeds',
    payload: { type: 'youtube', url: '@fireship', category: 'Tech' },
  });
  assert.equal(res.statusCode, 201);
  const feed = res.json().feed;
  assert.equal(feed.category, 'Tech');

  const techItems = await getItems('type=youtube&category=Tech');
  assert.equal(techItems.uncompleted.length, 3);
  assert.equal(techItems.uncompleted[0].feedCategory, 'Tech');

  const gamingItems = await getItems('type=youtube&category=Gaming');
  assert.equal(gamingItems.uncompleted.length, 0);

  // Update category to Homelab
  const patch = await app.inject({
    method: 'PATCH',
    url: `/api/feeds/${feed.id}`,
    payload: { category: 'Homelab' },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().feed.category, 'Homelab');

  const homelabItems = await getItems('type=youtube&category=Homelab');
  assert.equal(homelabItems.uncompleted.length, 3);

  // Clear category and query uncategorized feeds (__uncategorized__)
  await app.inject({
    method: 'PATCH',
    url: `/api/feeds/${feed.id}`,
    payload: { category: null },
  });
  const uncatItems = await getItems('type=youtube&category=__uncategorized__');
  assert.equal(uncatItems.uncompleted.length, 3);
});

test('supports inboxLimit and configurable completedDays (up to 30 days) on /api/items', async () => {
  await addYouTube();
  const limited = await getItems('type=youtube&inboxLimit=2');
  assert.equal(limited.uncompleted.length, 2, 'inboxLimit caps uncompleted items');

  // Complete an item and backdate it to 15 days ago
  const all = await getItems('type=youtube');
  const target = all.uncompleted[0];
  await app.inject({ method: 'PATCH', url: `/api/items/${target.id}`, payload: { completed: true } });
  db.prepare('UPDATE items SET completed_at = ? WHERE id = ?').run(Date.now() - 15 * DAY_MS, target.id);

  // With default 7 days it is hidden
  const default7 = await getItems('type=youtube');
  assert.equal(default7.completed.length, 0);

  // With completedDays=20 it is shown
  const custom20 = await getItems('type=youtube&completedDays=20');
  assert.equal(custom20.completed.length, 1);
  assert.equal(custom20.completed[0].id, target.id);
});

test('exports and imports OPML 2.0 files for YouTube and RSS feeds including categories', async () => {
  await app.inject({
    method: 'POST',
    url: '/api/feeds',
    payload: { type: 'youtube', url: '@fireship', category: 'Tech' },
  });

  const exportRes = await app.inject({ method: 'GET', url: '/api/feeds/opml?type=youtube' });
  assert.equal(exportRes.statusCode, 200);
  assert.match(exportRes.headers['content-type'] as string, /text\/x-opml/);
  assert.match(exportRes.body, /<opml version="2\.0">/);
  assert.match(exportRes.body, /Fireship/);
  assert.match(exportRes.body, /Tech/);

  // Import into a fresh database via OPML
  const opmlXml = exportRes.body;
  const feedsBefore = (await app.inject({ method: 'GET', url: '/api/feeds?type=youtube' })).json().feeds;
  await app.inject({ method: 'DELETE', url: `/api/feeds/${feedsBefore[0].id}` });
  assert.equal((await app.inject({ method: 'GET', url: '/api/feeds?type=youtube' })).json().feeds.length, 0);

  const importRes = await app.inject({
    method: 'POST',
    url: '/api/feeds/opml',
    payload: { type: 'youtube', opml: opmlXml },
  });
  assert.equal(importRes.statusCode, 200);
  assert.equal(importRes.json().imported, 1);
  assert.equal(importRes.json().skipped, 0);

  // Re-importing the same OPML skips existing feeds
  const secondImport = await app.inject({
    method: 'POST',
    url: '/api/feeds/opml',
    payload: { type: 'youtube', opml: opmlXml },
  });
  assert.equal(secondImport.json().imported, 0);
  assert.equal(secondImport.json().skipped, 1);

  const feedsAfter = (await app.inject({ method: 'GET', url: '/api/feeds?type=youtube' })).json().feeds;
  assert.equal(feedsAfter.length, 1);
  assert.equal(feedsAfter[0].title, 'Fireship');
  assert.equal(feedsAfter[0].category, 'Tech');
});

test('supports updating server settings (pollIntervalMinutes & autoArchive) and auto-archives old unread items without inflating stats', async () => {
  await addYouTube();

  const initialRes = await app.inject({ method: 'GET', url: '/api/settings' });
  assert.equal(initialRes.statusCode, 200);
  assert.equal(initialRes.json().settings.pollIntervalMinutes, 15);
  assert.equal(initialRes.json().settings.autoArchiveEnabled, false);

  // Backdate one unread item to 40 days ago while keeping the other 2 items recent
  const itemsBefore = await getItems('type=youtube');
  const oldUnread = itemsBefore.uncompleted[0];
  db.prepare('UPDATE items SET published_at = ? WHERE id = ?').run(Date.now() - 40 * DAY_MS, oldUnread.id);

  // Enable auto-archive for items older than 30 days and change poll interval to 30 min
  const patchRes = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: {
      pollIntervalMinutes: 30,
      autoArchiveEnabled: true,
      autoArchiveDays: 30,
    },
  });
  assert.equal(patchRes.statusCode, 200);
  assert.equal(patchRes.json().settings.pollIntervalMinutes, 30);
  assert.equal(patchRes.json().settings.autoArchiveEnabled, true);
  assert.equal(patchRes.json().settings.autoArchiveDays, 30);
  assert.equal(patchRes.json().archived, 1);

  const itemsAfter = await getItems('type=youtube');
  assert.equal(itemsAfter.uncompleted.length, 2, 'only the 40-day-old unread item was archived; newer items remain in inbox');
  assert.ok(itemsAfter.uncompleted.every((i: { id: number }) => i.id !== oldUnread.id));
  assert.equal(itemsAfter.completed.length, 0, 'auto-archived item does not appear in Watched/Read table');
  assert.equal(itemsAfter.stats.totalCompleted, 0, 'auto-archived item does not count toward watched/read stats');
  assert.equal(itemsAfter.stats.pendingCount, 2);

  // Re-syncing the feed must not re-add the auto-archived item to the inbox
  await app.inject({ method: 'POST', url: '/api/feeds/sync', payload: { type: 'youtube' } });
  const afterSync = await getItems('type=youtube');
  assert.equal(afterSync.uncompleted.length, 2);
});

test('exports and restores a full database backup including completion history and settings', async () => {
  const { feed } = await addYouTube();
  await app.inject({ method: 'PATCH', url: `/api/feeds/${feed.id}`, payload: { category: 'Tech' } });
  const before = await getItems('type=youtube');
  await app.inject({ method: 'PATCH', url: `/api/items/${before.uncompleted[0].id}`, payload: { completed: true } });
  await app.inject({ method: 'PATCH', url: '/api/settings', payload: { pollIntervalMinutes: 60 } });

  const backupRes = await app.inject({ method: 'GET', url: '/api/backup' });
  assert.equal(backupRes.statusCode, 200);
  const backup = backupRes.json();
  assert.equal(backup.app, 'tallydeck');
  assert.equal(backup.feeds.length, 1);
  assert.equal(backup.items.length, 3);
  assert.equal(backup.serverSettings.pollIntervalMinutes, 60);

  // Wipe feed and reset settings
  await app.inject({ method: 'DELETE', url: `/api/feeds/${feed.id}` });
  await app.inject({ method: 'PATCH', url: '/api/settings', payload: { pollIntervalMinutes: 5 } });
  assert.equal((await getItems('type=youtube')).uncompleted.length, 0);

  // Restore from backup
  const restoreRes = await app.inject({ method: 'POST', url: '/api/backup', payload: backup });
  assert.equal(restoreRes.statusCode, 200);
  assert.equal(restoreRes.json().feedsRestored, 1);
  assert.equal(restoreRes.json().itemsRestored, 3);
  assert.equal(restoreRes.json().serverSettings.pollIntervalMinutes, 60);

  const afterRestore = await getItems('type=youtube');
  assert.equal(afterRestore.uncompleted.length, 2);
  assert.equal(afterRestore.completed.length, 1);
  assert.equal(afterRestore.stats.totalCompleted, 1);
});

test('compareVersions and /api/version cache GitHub releases for 12h, retry errors after 1h, and support manual check', async () => {
  assert.ok(compareVersions('0.3.0', '0.2.0') > 0);
  assert.ok(compareVersions('v1.10.0', '1.2.9') > 0);
  assert.equal(compareVersions('v0.2.0', '0.2.0'), 0);
  assert.ok(compareVersions('0.1.9', '0.2.0') < 0);

  let clock = 1_000_000;
  let calls = 0;
  let shouldFail = false;
  let remoteVersion = '0.3.0';

  const versionService = createVersionService({
    current: '0.2.0',
    repo: 'EinfachFabi/tallydeck',
    enabled: true,
    now: () => clock,
    fetchLatest: async () => {
      calls += 1;
      if (shouldFail) throw new Error('network down');
      return {
        version: remoteVersion,
        url: `https://github.com/EinfachFabi/tallydeck/releases/tag/v${remoteVersion}`,
      };
    },
  });

  const versionApp = await buildApp({
    db,
    feedService: createFeedService(db, fetchText),
    versionService,
  });

  const first = await versionApp.inject({ method: 'GET', url: '/api/version' });
  assert.equal(first.statusCode, 200);
  const body1 = first.json();
  assert.equal(body1.current, '0.2.0');
  assert.equal(body1.latest, '0.3.0');
  assert.equal(body1.updateAvailable, true);
  assert.equal(body1.dockerImage, 'ghcr.io/einfachfabi/tallydeck');
  assert.equal(body1.releaseUrl, 'https://github.com/EinfachFabi/tallydeck/releases/tag/v0.3.0');
  assert.equal(calls, 1);

  // Within 12 hours, cached response is returned without another fetch.
  clock += 6 * 60 * 60 * 1000;
  const cached = await versionApp.inject({ method: 'GET', url: '/api/version' });
  assert.equal(cached.json().latest, '0.3.0');
  assert.equal(calls, 1);

  // After 12 hours, cache expires and fetches again.
  clock += 6 * 60 * 60 * 1000;
  remoteVersion = '0.2.0';
  const expired = await versionApp.inject({ method: 'GET', url: '/api/version' });
  assert.equal(expired.json().latest, '0.2.0');
  assert.equal(expired.json().updateAvailable, false);
  assert.equal(calls, 2);

  // POST /api/version/check forces an immediate check.
  remoteVersion = '0.4.0';
  const manual = await versionApp.inject({ method: 'POST', url: '/api/version/check' });
  assert.equal(manual.statusCode, 200);
  assert.equal(manual.json().latest, '0.4.0');
  assert.equal(manual.json().updateAvailable, true);
  assert.equal(calls, 3);

  // Errors are recorded and retried after 1 hour.
  shouldFail = true;
  const failed = await versionApp.inject({ method: 'POST', url: '/api/version/check' });
  assert.match(failed.json().error, /network down/);
  assert.equal(calls, 4);

  clock += 30 * 60 * 1000;
  await versionApp.inject({ method: 'GET', url: '/api/version' });
  assert.equal(calls, 4, 'still in 1h error backoff');

  clock += 30 * 60 * 1000;
  shouldFail = false;
  remoteVersion = '0.5.0';
  const recovered = await versionApp.inject({ method: 'GET', url: '/api/version' });
  assert.equal(recovered.json().error, null);
  assert.equal(recovered.json().latest, '0.5.0');
  assert.equal(calls, 5);

  // Disabled update check never invokes fetchLatest.
  let disabledCalls = 0;
  const disabledApp = await buildApp({
    db,
    feedService: createFeedService(db, fetchText),
    versionService: createVersionService({
      current: '0.2.0',
      repo: 'EinfachFabi/tallydeck',
      enabled: false,
      fetchLatest: async () => {
        disabledCalls += 1;
        return null;
      },
    }),
  });
  const disabledRes = await disabledApp.inject({ method: 'GET', url: '/api/version' });
  assert.equal(disabledRes.json().checkEnabled, false);
  assert.equal(disabledRes.json().updateAvailable, false);
  assert.equal(disabledCalls, 0);
});

test('supports topic CRUD (colors, rename, merge, delete) and preserves topic colors in full backups', async () => {
  // Create empty topic with explicit color
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/topics',
    payload: { name: 'Homelab', color: 2 },
  });
  assert.equal(createRes.statusCode, 201);
  assert.deepEqual(createRes.json().topics, [{ name: 'Homelab', color: 2, youtubeCount: 0, rssCount: 0 }]);

  // Invalid empty topic rejected
  const invalidRes = await app.inject({ method: 'POST', url: '/api/topics', payload: { name: '   ' } });
  assert.equal(invalidRes.statusCode, 400);
  assert.equal(invalidRes.json().error, 'invalid_topic');

  // Add YouTube + RSS feeds with categories
  const ytRes = await app.inject({
    method: 'POST',
    url: '/api/feeds',
    payload: { type: 'youtube', url: '@fireship', category: 'Tech' },
  });
  assert.equal(ytRes.statusCode, 201);
  const rssRes = await app.inject({
    method: 'POST',
    url: '/api/feeds',
    payload: { type: 'rss', url: RSS_FEED, category: 'Homelab' },
  });
  assert.equal(rssRes.statusCode, 201);

  const listed = (await app.inject({ method: 'GET', url: '/api/topics' })).json().topics;
  assert.deepEqual(listed, [
    { name: 'Homelab', color: 2, youtubeCount: 0, rssCount: 1 },
    { name: 'Tech', color: null, youtubeCount: 1, rssCount: 0 },
  ]);

  // Update color of Tech and rename it
  const patchTech = await app.inject({
    method: 'PATCH',
    url: '/api/topics/Tech',
    payload: { newName: 'Dev', color: 4 },
  });
  assert.equal(patchTech.statusCode, 200);
  assert.deepEqual(patchTech.json().topics, [
    { name: 'Dev', color: 4, youtubeCount: 1, rssCount: 0 },
    { name: 'Homelab', color: 2, youtubeCount: 0, rssCount: 1 },
  ]);

  // Merging Dev into Homelab moves the YouTube feed to Homelab
  const mergeRes = await app.inject({
    method: 'PATCH',
    url: '/api/topics/Dev',
    payload: { newName: 'Homelab' },
  });
  assert.equal(mergeRes.statusCode, 200);
  assert.deepEqual(mergeRes.json().topics, [{ name: 'Homelab', color: 2, youtubeCount: 1, rssCount: 1 }]);

  // Also add an empty topic with preset color 14 and set custom hex colors before exporting backup
  await app.inject({ method: 'POST', url: '/api/topics', payload: { name: 'Science', color: 14 } });
  const customHexRes = await app.inject({
    method: 'PATCH',
    url: '/api/topics/Homelab',
    payload: { color: '#FF6B6B' },
  });
  assert.equal(customHexRes.statusCode, 200);
  assert.deepEqual(customHexRes.json().topics, [
    { name: 'Homelab', color: '#ff6b6b', youtubeCount: 1, rssCount: 1 },
    { name: 'Science', color: 14, youtubeCount: 0, rssCount: 0 },
  ]);

  // Shorthand #rgb expands to #rrggbb; invalid colors normalize to null
  const shortHexRes = await app.inject({
    method: 'PATCH',
    url: '/api/topics/Science',
    payload: { color: '#abc' },
  });
  assert.equal(shortHexRes.json().topics.find((t: { name: string }) => t.name === 'Science').color, '#aabbcc');

  const invalidColorRes = await app.inject({
    method: 'POST',
    url: '/api/topics',
    payload: { name: 'Gaming', color: 'not-a-color' },
  });
  assert.equal(invalidColorRes.json().topics.find((t: { name: string }) => t.name === 'Gaming').color, null);

  const outOfRangeRes = await app.inject({
    method: 'PATCH',
    url: '/api/topics/Gaming',
    payload: { color: 99 },
  });
  assert.equal(outOfRangeRes.json().topics.find((t: { name: string }) => t.name === 'Gaming').color, null);

  // Restore Science back to preset 14 before backup round-trip
  await app.inject({ method: 'PATCH', url: '/api/topics/Science', payload: { color: 14 } });
  await app.inject({ method: 'DELETE', url: '/api/topics/Gaming' });

  const backup = (await app.inject({ method: 'GET', url: '/api/backup' })).json();
  assert.ok(Array.isArray(backup.topics));

  // Delete Homelab -> feeds stay, category becomes null
  const delRes = await app.inject({ method: 'DELETE', url: '/api/topics/Homelab' });
  assert.equal(delRes.statusCode, 200);
  assert.deepEqual(delRes.json().topics, [{ name: 'Science', color: 14, youtubeCount: 0, rssCount: 0 }]);
  const ytFeeds = (await app.inject({ method: 'GET', url: '/api/feeds?type=youtube' })).json().feeds;
  assert.equal(ytFeeds.length, 1);
  assert.equal(ytFeeds[0].category, null);

  // Restore into a fresh DB preserves custom hex colors, preset indices & empty topics
  const freshDb = openDatabase(':memory:');
  const freshApp = await buildApp({ db: freshDb, feedService: createFeedService(freshDb, fetchText) });
  const restoreRes = await freshApp.inject({ method: 'POST', url: '/api/backup', payload: backup });
  assert.equal(restoreRes.statusCode, 200);
  const restoredTopics = (await freshApp.inject({ method: 'GET', url: '/api/topics' })).json().topics;
  assert.deepEqual(restoredTopics, [
    { name: 'Homelab', color: '#ff6b6b', youtubeCount: 1, rssCount: 1 },
    { name: 'Science', color: 14, youtubeCount: 0, rssCount: 0 },
  ]);
});

