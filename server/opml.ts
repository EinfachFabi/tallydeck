import type { FeedType } from './db.ts';
import type { FeedDto } from './repository.ts';

export interface OpmlEntry {
  url: string;
  title: string | null;
  siteUrl: string | null;
  category: string | null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(re);
  const raw = m?.[1] ?? m?.[2];
  return raw !== undefined ? unescapeXml(raw).trim() : null;
}

/**
 * Generates an OPML 2.0 XML document for the given feeds, grouping categorized
 * feeds into folder `<outline>` elements and placing uncategorized feeds at top level.
 */
export function buildOpml(type: FeedType, feeds: FeedDto[], now = new Date()): string {
  const docTitle = type === 'youtube' ? 'TallyDeck YouTube Subscriptions' : 'TallyDeck RSS Subscriptions';
  const groups = new Map<string, { name: string; items: FeedDto[] }>();
  const uncategorized: FeedDto[] = [];

  for (const feed of feeds) {
    const cat = feed.category?.trim();
    if (!cat) {
      uncategorized.push(feed);
      continue;
    }
    const key = cat.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(feed);
    } else {
      groups.set(key, { name: cat, items: [feed] });
    }
  }

  const renderFeedOutline = (feed: FeedDto, indent: string): string => {
    const attrs = [
      `text="${escapeXml(feed.title)}"`,
      `title="${escapeXml(feed.title)}"`,
      'type="rss"',
      `xmlUrl="${escapeXml(feed.feedUrl)}"`,
    ];
    const htmlUrl = feed.siteUrl ?? feed.sourceUrl;
    if (htmlUrl) attrs.push(`htmlUrl="${escapeXml(htmlUrl)}"`);
    if (feed.category) attrs.push(`category="${escapeXml(feed.category)}"`);
    return `${indent}<outline ${attrs.join(' ')} />`;
  };

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(docTitle)}</title>`,
    `    <dateCreated>${now.toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>',
  ];

  const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const group of sortedGroups) {
    lines.push(`    <outline text="${escapeXml(group.name)}" title="${escapeXml(group.name)}">`);
    for (const feed of group.items) {
      lines.push(renderFeedOutline(feed, '      '));
    }
    lines.push('    </outline>');
  }

  for (const feed of uncategorized) {
    lines.push(renderFeedOutline(feed, '    '));
  }

  lines.push('  </body>', '</opml>', '');
  return lines.join('\n');
}

/**
 * Parses an OPML XML document (including folder outlines for categories) into feed entries.
 */
export function parseOpml(xml: string): OpmlEntry[] {
  const entries: OpmlEntry[] = [];
  const seenUrls = new Set<string>();
  const folderStack: (string | null)[] = [];

  const tokenRe = /<\/?outline\b[^>]*>/gi;
  for (const match of xml.matchAll(tokenRe)) {
    const token = match[0];
    if (/^<\/outline/i.test(token)) {
      folderStack.pop();
      continue;
    }

    const selfClosing = /\/>\s*$/.test(token);
    const xmlUrl = readAttr(token, 'xmlUrl') ?? readAttr(token, 'url');
    const htmlUrl = readAttr(token, 'htmlUrl');
    const title = readAttr(token, 'title') ?? readAttr(token, 'text');
    const explicitCategory = readAttr(token, 'category')?.split('/')[0]?.trim() || null;

    if (xmlUrl) {
      const currentFolder = folderStack.filter(Boolean).at(-1) ?? null;
      const category = explicitCategory ?? currentFolder;
      const normalizedKey = xmlUrl.toLowerCase();
      if (!seenUrls.has(normalizedKey)) {
        seenUrls.add(normalizedKey);
        entries.push({
          url: xmlUrl,
          title: title || null,
          siteUrl: htmlUrl || null,
          category: category || null,
        });
      }
      if (!selfClosing) {
        folderStack.push(null);
      }
    } else if (!selfClosing) {
      folderStack.push(title || null);
    }
  }

  return entries;
}
