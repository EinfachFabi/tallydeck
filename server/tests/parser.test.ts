import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedXml, looksLikeFeed } from '../feedParser.ts';
import { extractChannelId, normalizeYouTubeInput, resolveYouTubeFeed, resolveRssFeed, discoverFeedLinks } from '../resolvers.ts';
import type { FetchText } from '../http.ts';
import { ATOM_FEED_XML, CHANNEL_ID, WEBSITE_HTML, YOUTUBE_CHANNEL_HTML, rssFeedXml, youtubeFeedXml } from './fixtures.ts';

function fakeFetch(routes: Record<string, string>): FetchText & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    if (!(url in routes)) throw new Error(`HTTP 404 for ${url}`);
    return { text: routes[url], finalUrl: url, contentType: 'text/html' };
  }) as FetchText & { calls: string[] };
  fn.calls = calls;
  return fn;
}

test('parses a YouTube channel feed incl. thumbnails and shorts detection', async () => {
  const xml = youtubeFeedXml([
    { id: 'aaaaaaaaaaa', title: 'Rust in 100 Seconds', published: '2026-11-17T15:00:00+00:00' },
    { id: 'bbbbbbbbbbb', title: 'Quick tip', published: '2026-11-16T15:00:00+00:00', short: true },
  ]);
  const feed = await parseFeedXml(xml, 'youtube');
  assert.equal(feed.title, 'Fireship');
  assert.equal(feed.channelId, CHANNEL_ID);
  assert.equal(feed.items.length, 2);

  const [video, short] = feed.items;
  assert.equal(video.externalId, 'aaaaaaaaaaa');
  assert.equal(video.title, 'Rust in 100 Seconds');
  assert.equal(video.url, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
  assert.equal(video.thumbnailUrl, 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg');
  assert.equal(video.author, 'Fireship');
  assert.equal(video.summary, 'Description of Rust in 100 Seconds');
  assert.equal(video.publishedAt, Date.parse('2026-11-17T15:00:00Z'));
  assert.equal(video.isShort, false);
  assert.equal(short.isShort, true);
});

test('parses an RSS 2.0 feed with image extraction', async () => {
  const xml = rssFeedXml([{ guid: 'n1', title: 'Breaking &amp; news', date: 'Tue, 17 Nov 2026 10:00:00 GMT' }]);
  const feed = await parseFeedXml(xml, 'rss');
  assert.equal(feed.title, 'Example News');
  assert.equal(feed.iconUrl, 'https://news.example.com/logo.png');
  const [item] = feed.items;
  assert.equal(item.externalId, 'n1');
  assert.equal(item.title, 'Breaking & news');
  assert.equal(item.url, 'https://news.example.com/articles/n1');
  assert.equal(item.thumbnailUrl, 'https://news.example.com/img/n1.jpg');
  assert.equal(item.author, 'Jane Doe');
  assert.match(item.summary ?? '', /Summary of Breaking/);
  assert.equal(item.publishedAt, Date.parse('2026-11-17T10:00:00Z'));
});

test('parses an Atom feed and resolves relative links', async () => {
  const feed = await parseFeedXml(ATOM_FEED_XML, 'rss', 'https://blog.example.org/atom.xml');
  assert.equal(feed.title, 'Atom Blog');
  assert.equal(feed.items[0].url, 'https://blog.example.org/posts/hello');
  assert.equal(feed.items[0].externalId, 'urn:uuid:hello');
});

test('rejects non-feed content', async () => {
  assert.equal(looksLikeFeed('<html><body>nope</body></html>'), false);
  await assert.rejects(parseFeedXml('<html><body>nope</body></html>', 'rss'), { code: 'not_a_feed' });
});

test('normalizes YouTube inputs', () => {
  assert.equal(normalizeYouTubeInput('@fireship'), 'https://www.youtube.com/@fireship');
  assert.equal(normalizeYouTubeInput(CHANNEL_ID), `https://www.youtube.com/channel/${CHANNEL_ID}`);
  assert.equal(normalizeYouTubeInput('youtube.com/@fireship'), 'https://youtube.com/@fireship');
  assert.throws(() => normalizeYouTubeInput('not a url'), { code: 'invalid_url' });
});

test('extracts channel id from channel page HTML', () => {
  assert.equal(extractChannelId(YOUTUBE_CHANNEL_HTML), CHANNEL_ID);
  assert.equal(extractChannelId(`{"externalId":"${CHANNEL_ID}"}`), CHANNEL_ID);
  assert.equal(extractChannelId('<html></html>'), null);
});

test('resolves @handle links to the channel RSS feed', async () => {
  const fetch = fakeFetch({ 'https://www.youtube.com/@fireship': YOUTUBE_CHANNEL_HTML });
  const res = await resolveYouTubeFeed('https://www.youtube.com/@fireship', fetch);
  assert.equal(res.feedUrl, `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  assert.equal(res.channelId, CHANNEL_ID);
  assert.equal(res.iconUrl, 'https://yt3.googleusercontent.com/avatar=s900');
});

test('resolves /channel/ links even when the page cannot be loaded', async () => {
  const res = await resolveYouTubeFeed(`https://www.youtube.com/channel/${CHANNEL_ID}/videos`, fakeFetch({}));
  assert.equal(res.feedUrl, `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
});

test('accepts existing YouTube feed URLs and rejects non-YouTube links', async () => {
  const res = await resolveYouTubeFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, fakeFetch({}));
  assert.equal(res.channelId, CHANNEL_ID);
  await assert.rejects(resolveYouTubeFeed('https://example.com/@x', fakeFetch({})), { code: 'invalid_url' });
});

test('discovers RSS feeds from a website via <link rel="alternate">', async () => {
  assert.deepEqual(discoverFeedLinks(WEBSITE_HTML, 'https://news.example.com/'), ['https://news.example.com/feed.xml']);
  const xml = rssFeedXml([{ guid: 'x', title: 'X', date: 'Tue, 17 Nov 2026 10:00:00 GMT' }]);
  const fetch = fakeFetch({ 'https://news.example.com/': WEBSITE_HTML, 'https://news.example.com/feed.xml': xml });
  const res = await resolveRssFeed('news.example.com/', fetch);
  assert.equal(res.feedUrl, 'https://news.example.com/feed.xml');
});
