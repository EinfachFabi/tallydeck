export const CHANNEL_ID = 'UCsBjURrPoezykLs9EqgamOA';

export function youtubeFeedXml(videos: { id: string; title: string; published: string; short?: boolean }[]): string {
  const entries = videos
    .map(
      (v) => `
 <entry>
  <id>yt:video:${v.id}</id>
  <yt:videoId>${v.id}</yt:videoId>
  <yt:channelId>${CHANNEL_ID}</yt:channelId>
  <title>${v.title}</title>
  <link rel="alternate" href="https://www.youtube.com/${v.short ? `shorts/${v.id}` : `watch?v=${v.id}`}"/>
  <author>
   <name>Fireship</name>
   <uri>https://www.youtube.com/channel/${CHANNEL_ID}</uri>
  </author>
  <published>${v.published}</published>
  <updated>${v.published}</updated>
  <media:group>
   <media:title>${v.title}</media:title>
   <media:content url="https://www.youtube.com/v/${v.id}?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
   <media:thumbnail url="https://i2.ytimg.com/vi/${v.id}/hqdefault.jpg" width="480" height="360"/>
   <media:description>Description of ${v.title}</media:description>
   <media:community>
    <media:starRating count="100" average="5.00" min="1" max="5"/>
    <media:statistics views="1000"/>
   </media:community>
  </media:group>
 </entry>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}"/>
 <id>yt:channel:${CHANNEL_ID.slice(2)}</id>
 <yt:channelId>${CHANNEL_ID}</yt:channelId>
 <title>Fireship</title>
 <link rel="alternate" href="https://www.youtube.com/channel/${CHANNEL_ID}"/>
 <author>
  <name>Fireship</name>
  <uri>https://www.youtube.com/channel/${CHANNEL_ID}</uri>
 </author>
 <published>2017-04-07T14:34:22+00:00</published>${entries}
</feed>`;
}

export const YOUTUBE_CHANNEL_HTML = `<!DOCTYPE html><html><head>
<title>Fireship - YouTube</title>
<meta property="og:title" content="Fireship">
<meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900">
<link rel="alternate" type="application/rss+xml" title="RSS" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}">
<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL_ID}">
</head><body><script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"externalId":"${CHANNEL_ID}"}}};</script></body></html>`;

export function rssFeedXml(items: { guid: string; title: string; date: string }[]): string {
  const body = items
    .map(
      (i) => `
    <item>
      <title>${i.title}</title>
      <link>https://news.example.com/articles/${i.guid}</link>
      <guid isPermaLink="false">${i.guid}</guid>
      <pubDate>${i.date}</pubDate>
      <dc:creator>Jane Doe</dc:creator>
      <description><![CDATA[<p><img src="https://news.example.com/img/${i.guid}.jpg"> Summary of ${i.title}</p>]]></description>
    </item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example News</title>
    <link>https://news.example.com/</link>
    <description>All the news</description>
    <image><url>https://news.example.com/logo.png</url><title>Example News</title><link>https://news.example.com/</link></image>${body}
  </channel>
</rss>`;
}

export const ATOM_FEED_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <link href="https://blog.example.org/"/>
  <updated>2026-11-10T18:30:02Z</updated>
  <id>urn:uuid:blog</id>
  <entry>
    <title>Hello Atom</title>
    <link href="/posts/hello"/>
    <id>urn:uuid:hello</id>
    <updated>2026-11-10T18:30:02Z</updated>
    <summary>First post</summary>
  </entry>
</feed>`;

export const WEBSITE_HTML = `<!doctype html><html><head><title>Example News</title>
<link rel="alternate" type="application/rss+xml" title="Example News RSS" href="/feed.xml">
</head><body>Hi</body></html>`;
