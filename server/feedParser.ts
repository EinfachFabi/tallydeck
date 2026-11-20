import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import type { FeedType } from './db.ts';
import type { NormalizedItem } from './repository.ts';
import { AppError, errorMessage } from './errors.ts';

export interface ParsedFeed {
  title: string | null;
  siteUrl: string | null;
  iconUrl: string | null;
  channelId: string | null;
  items: NormalizedItem[];
}

type Attrs = { $?: Record<string, string> };
type AnyRecord = Record<string, unknown>;

const parser = new Parser<AnyRecord, AnyRecord>({
  timeout: 20_000,
  customFields: {
    feed: ['yt:channelId', 'icon', 'logo'],
    item: [
      ['yt:videoId', 'ytVideoId'],
      ['media:group', 'mediaGroup'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['dc:creator', 'dcCreator'],
    ],
  },
});

const SUMMARY_MAX = 300;

export function looksLikeFeed(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes('<rss') || head.includes('<feed') || head.includes('<rdf:rdf');
}

function firstString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value === 'object') {
    const obj = value as AnyRecord;
    if (typeof obj._ === 'string') return obj._.trim() || null;
    if (typeof obj.name === 'string') return obj.name.trim() || null;
    if (Array.isArray(obj.name)) return firstString(obj.name);
  }
  return null;
}

function attrUrl(value: unknown): string | null {
  if (!value) return null;
  const list = Array.isArray(value) ? value : [value];
  for (const entry of list) {
    if (typeof entry === 'string' && /^https?:/i.test(entry)) return entry;
    const url = (entry as Attrs)?.$?.url;
    if (url) return url;
  }
  return null;
}

function imageFromMediaContent(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value as Attrs[]) {
    const a = entry?.$;
    if (!a?.url) continue;
    if (a.medium === 'image' || a.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(a.url)) {
      return a.url;
    }
  }
  return null;
}

function imageFromHtml(html: unknown): string | null {
  if (typeof html !== 'string') return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match && /^https?:/i.test(match[1]) ? match[1] : null;
}

function parseDate(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (typeof c !== 'string' || !c) continue;
    const t = Date.parse(c);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function truncate(text: string | null): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > SUMMARY_MAX ? `${clean.slice(0, SUMMARY_MAX - 1)}…` : clean;
}

function absolutize(url: string | null, base: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, base ?? undefined).toString();
  } catch {
    return null;
  }
}

function hashId(...parts: (string | null | undefined)[]): string {
  return createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex');
}

function normalizeYouTubeItem(item: AnyRecord): NormalizedItem | null {
  const link = typeof item.link === 'string' ? item.link : null;
  const idFromEntry = typeof item.id === 'string' ? item.id.replace(/^yt:video:/, '') : null;
  const videoId = firstString(item.ytVideoId) ?? idFromEntry ?? link?.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;
  if (!videoId) return null;

  const group = (item.mediaGroup ?? {}) as AnyRecord;
  const description = firstString(group['media:description']);
  const isShort = typeof link === 'string' && link.includes('/shorts/');

  return {
    externalId: videoId,
    title: firstString(item.title) ?? firstString(group['media:title']) ?? videoId,
    url: link ?? `https://www.youtube.com/watch?v=${videoId}`,
    // mqdefault is 16:9 (320x180) without black bars, unlike the hqdefault from the feed.
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    author: firstString(item.author) ?? firstString(item.creator),
    summary: truncate(description),
    publishedAt: parseDate(item.isoDate, item.pubDate),
    isShort,
  };
}

function normalizeRssItem(item: AnyRecord, siteUrl: string | null): NormalizedItem | null {
  const rawLink = typeof item.link === 'string' ? item.link.trim() : null;
  const url = absolutize(rawLink, siteUrl) ?? (typeof item.guid === 'string' && /^https?:/i.test(item.guid) ? item.guid : null);
  const title = firstString(item.title) ?? truncate(firstString(item.contentSnippet))?.slice(0, 120) ?? null;
  if (!url && !title) return null;

  const guid = firstString(item.guid) ?? firstString(item.id);
  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  const enclosureImage = enclosure?.url && (enclosure.type ?? '').startsWith('image/') ? enclosure.url : null;
  const itunes = item.itunes as { image?: string } | undefined;

  const thumbnail =
    attrUrl(item.mediaThumbnail) ??
    imageFromMediaContent(item.mediaContent) ??
    enclosureImage ??
    itunes?.image ??
    imageFromHtml(item['content:encoded']) ??
    imageFromHtml(item.content);

  return {
    externalId: guid ?? url ?? hashId(title, String(item.pubDate ?? '')),
    title: title ?? url ?? 'Untitled',
    url: url ?? siteUrl ?? '',
    thumbnailUrl: absolutize(thumbnail, url ?? siteUrl),
    author: firstString(item.creator) ?? firstString(item.dcCreator) ?? firstString(item.author),
    summary: truncate(firstString(item.contentSnippet) ?? firstString(item.summary)),
    publishedAt: parseDate(item.isoDate, item.pubDate),
    isShort: false,
  };
}

export async function parseFeedXml(xml: string, type: FeedType, feedUrl?: string): Promise<ParsedFeed> {
  let feed: AnyRecord & { items?: AnyRecord[] };
  try {
    feed = (await parser.parseString(xml)) as AnyRecord & { items?: AnyRecord[] };
  } catch (err) {
    throw new AppError('not_a_feed', 422, `Could not parse feed: ${errorMessage(err)}`);
  }

  const siteUrl = absolutize(typeof feed.link === 'string' ? feed.link : null, feedUrl ?? null);
  const image = feed.image as { url?: string } | undefined;
  const iconUrl = absolutize(image?.url ?? firstString(feed.icon) ?? firstString(feed.logo), siteUrl ?? feedUrl ?? null);

  const seen = new Set<string>();
  const items: NormalizedItem[] = [];
  for (const raw of feed.items ?? []) {
    const item = type === 'youtube' ? normalizeYouTubeItem(raw) : normalizeRssItem(raw, siteUrl ?? feedUrl ?? null);
    if (!item || !item.url || seen.has(item.externalId)) continue;
    seen.add(item.externalId);
    items.push(item);
  }

  return {
    title: firstString(feed.title),
    siteUrl,
    iconUrl,
    channelId: firstString(feed['yt:channelId']),
    items,
  };
}
