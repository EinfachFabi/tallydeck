import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DatabaseSync } from '../db.ts';
import { DAY_MS } from '../repository.ts';
import { createFeedService } from '../feedService.ts';
import { buildApp } from '../app.ts';
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
