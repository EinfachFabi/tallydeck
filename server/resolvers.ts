import type { FetchText } from './http.ts';
import { AppError } from './errors.ts';
import { looksLikeFeed } from './feedParser.ts';

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const YT_FEED_BASE = 'https://www.youtube.com/feeds/videos.xml';

export interface ResolvedYouTube {
  feedUrl: string;
  channelId: string | null;
  sourceUrl: string;
  iconUrl: string | null;
  pageTitle: string | null;
}

export function youtubeFeedUrl(channelId: string): string {
  return `${YT_FEED_BASE}?channel_id=${channelId}`;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)=["']${property}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${property}["']`,
    'i',
  );
  const m = html.match(re);
  const value = m?.[1] ?? m?.[2];
  return value ? decodeHtml(value) : null;
}

/** Extracts the canonical channel id (UC...) from a YouTube channel or video page. */
export function extractChannelId(html: string): string | null {
  const patterns = [
    /feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/,
    /"externalId"\s*:\s*"(UC[\w-]{22})"/,
    /<meta[^>]+itemprop=["'](?:identifier|channelId)["'][^>]+content=["'](UC[\w-]{22})["']/,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[\w-]{22})/,
    /"channelId"\s*:\s*"(UC[\w-]{22})"/,
    /"browseId"\s*:\s*"(UC[\w-]{22})"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Turns user input (handle, channel id, URL) into an absolute URL. */
export function normalizeYouTubeInput(input: string): string {
  const value = input.trim();
  if (!value) throw new AppError('invalid_url', 400, 'Please provide a YouTube channel link.');
  if (CHANNEL_ID_RE.test(value)) return `https://www.youtube.com/channel/${value}`;
  if (value.startsWith('@')) return `https://www.youtube.com/${value}`;
  if (/^(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(value)) return `https://${value}`;
  if (!/^https?:\/\//i.test(value)) {
    throw new AppError('invalid_url', 400, 'Please provide a valid YouTube channel link, e.g. https://www.youtube.com/@name');
  }
  return value;
}

/**
 * Resolves any YouTube link (@handle, /channel/, /c/, /user/, video URL, or feed URL)
 * to the official channel RSS feed: https://www.youtube.com/feeds/videos.xml?channel_id=UC...
 */
export async function resolveYouTubeFeed(input: string, fetchText: FetchText): Promise<ResolvedYouTube> {
  const sourceUrl = normalizeYouTubeInput(input);
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new AppError('invalid_url', 400, 'Please provide a valid YouTube channel link.');
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') {
    throw new AppError('invalid_url', 400, 'This is not a YouTube link.');
  }

  // Already a feed URL.
  if (url.pathname === '/feeds/videos.xml') {
    const channelId = url.searchParams.get('channel_id');
    const playlistId = url.searchParams.get('playlist_id');
    if (channelId && CHANNEL_ID_RE.test(channelId)) {
      return { feedUrl: youtubeFeedUrl(channelId), channelId, sourceUrl, iconUrl: null, pageTitle: null };
    }
    if (playlistId) {
      return { feedUrl: `${YT_FEED_BASE}?playlist_id=${playlistId}`, channelId: null, sourceUrl, iconUrl: null, pageTitle: null };
    }
    throw new AppError('invalid_url', 400, 'The YouTube feed URL has no channel_id.');
  }

  // Direct /channel/UC... links – no lookup needed for the id, but we still try to load the avatar.
  const direct = url.pathname.match(/^\/channel\/(UC[\w-]{22})/);
  let channelId: string | null = direct ? direct[1] : null;
  let html: string | null = null;

  try {
    const pageUrl = channelId ? `https://www.youtube.com/channel/${channelId}` : url.toString();
    html = (await fetchText(pageUrl)).text;
  } catch (err) {
    if (!channelId) throw err;
  }

  if (!channelId && html) channelId = extractChannelId(html);
  if (!channelId) {
    throw new AppError(
      'youtube_channel_not_found',
      422,
      'Could not find a YouTube channel for this link. Try the channel page URL, e.g. https://www.youtube.com/@name',
    );
  }

  const ogTitle = html ? metaContent(html, 'og:title') : null;
  const avatar = html ? metaContent(html, 'og:image') : null;
  // On video pages og:image is the video thumbnail, not the channel avatar.
  const isVideoPage = /^\/(watch|shorts\/|live\/)/.test(url.pathname) || host === 'youtu.be';

  return {
    feedUrl: youtubeFeedUrl(channelId),
    channelId,
    sourceUrl,
    iconUrl: isVideoPage ? null : avatar,
    pageTitle: isVideoPage ? null : ogTitle,
  };
}

/** Finds <link rel="alternate" type="application/rss+xml|atom+xml"> feeds in an HTML page. */
export function discoverFeedLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const tagRe = /<link\b[^>]*>/gi;
  for (const tag of html.match(tagRe) ?? []) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom|feed)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      links.push(new URL(decodeHtml(href), baseUrl).toString());
    } catch {
      /* ignore invalid */
    }
  }
  return [...new Set(links)];
}

export interface ResolvedRss {
  feedUrl: string;
  xml: string;
  sourceUrl: string;
}

const COMMON_FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/index.xml', '/feed/'];

/**
 * Resolves a feed URL or website URL to an RSS/Atom feed.
 * Website URLs are handled via <link rel="alternate"> autodiscovery and common feed paths.
 */
export async function resolveRssFeed(input: string, fetchText: FetchText): Promise<ResolvedRss> {
  let value = input.trim();
  if (!value) throw new AppError('invalid_url', 400, 'Please provide a feed URL.');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    new URL(value);
  } catch {
    throw new AppError('invalid_url', 400, 'Please provide a valid URL.');
  }

  const first = await fetchText(value);
  if (looksLikeFeed(first.text)) {
    return { feedUrl: first.finalUrl || value, xml: first.text, sourceUrl: value };
  }

  const candidates = discoverFeedLinks(first.text, first.finalUrl || value);
  const origin = new URL(first.finalUrl || value).origin;
  for (const path of COMMON_FEED_PATHS) candidates.push(origin + path);

  for (const candidate of [...new Set(candidates)]) {
    try {
      const res = await fetchText(candidate);
      if (looksLikeFeed(res.text)) {
        return { feedUrl: res.finalUrl || candidate, xml: res.text, sourceUrl: value };
      }
    } catch {
      /* try next candidate */
    }
  }

  throw new AppError('not_a_feed', 422, 'No RSS or Atom feed found at this URL.');
}
