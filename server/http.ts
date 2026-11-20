import { AppError, errorMessage } from './errors.ts';

export interface FetchResult {
  text: string;
  finalUrl: string;
  contentType: string;
}

/** Injectable fetcher (replaced by fixtures in tests). */
export type FetchText = (url: string) => Promise<FetchResult>;

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 TallyDeck/1.0';

const MAX_BYTES = 10 * 1024 * 1024;

function isYouTubeHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  } catch {
    return false;
  }
}

export const defaultFetchText: FetchText = async (url) => {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  // Skip the EU cookie-consent interstitial on YouTube pages.
  if (isYouTubeHost(url)) headers.Cookie = 'CONSENT=YES+cb; SOCS=CAI';

  let res: Response;
  try {
    res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new AppError('fetch_failed', 502, `Could not reach ${url}: ${errorMessage(err)}`);
  }
  if (!res.ok) {
    throw new AppError('fetch_failed', 502, `HTTP ${res.status} while fetching ${url}`);
  }
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new AppError('fetch_failed', 502, `Response from ${url} is too large`);
  }
  return {
    text: new TextDecoder('utf-8').decode(buffer),
    finalUrl: res.url || url,
    contentType: res.headers.get('content-type') ?? '',
  };
};
