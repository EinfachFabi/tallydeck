/**
 * Update check against the GitHub Releases API.
 *
 * The server (not every browser) asks GitHub for the latest release at most every
 * `CHECK_INTERVAL_MS` and caches the answer. Failed checks are retried sooner.
 * There is no auto-update: the UI only shows a hint plus the matching docker command.
 */

export interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  /** Release page of the latest release (falls back to the releases overview). */
  releaseUrl: string | null;
  /** Releases overview / changelog. */
  releasesUrl: string;
  repoUrl: string;
  /** Container image without tag, e.g. ghcr.io/einfachfabi/tallydeck */
  dockerImage: string;
  checkEnabled: boolean;
  checkedAt: number | null;
  error: string | null;
}

export interface LatestRelease {
  version: string;
  url: string | null;
}

/** Injectable fetcher for the latest release (replaced in tests). Returns null if no release exists. */
export type FetchLatestRelease = (repo: string) => Promise<LatestRelease | null>;

export interface VersionServiceOptions {
  current: string;
  /** GitHub "owner/name" */
  repo: string;
  enabled: boolean;
  fetchLatest?: FetchLatestRelease;
  now?: () => number;
}

export interface VersionService {
  current: string;
  /** Cached info; triggers a background-safe refresh when stale. */
  get(): Promise<VersionInfo>;
  /** Forces a fresh check (used by the "Check now" button). */
  refresh(): Promise<VersionInfo>;
}

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_ERROR_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Parses "v1.2.3" / "1.2.3-beta.1" into numeric parts (pre-release suffix ignored). */
function parseVersion(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Returns > 0 if a is newer than b, < 0 if older, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const githubFetchLatest: FetchLatestRelease = async (repo) => {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TallyDeck-UpdateCheck',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null; // repository has no published release yet
  if (!res.ok) throw new Error(`GitHub API responded with HTTP ${res.status}`);
  const data = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
  if (typeof data.tag_name !== 'string' || !data.tag_name.trim()) return null;
  return {
    version: data.tag_name.trim().replace(/^v/i, ''),
    url: typeof data.html_url === 'string' ? data.html_url : null,
  };
};

export function createVersionService(options: VersionServiceOptions): VersionService {
  const { current, repo, enabled } = options;
  const fetchLatest = options.fetchLatest ?? githubFetchLatest;
  const now = options.now ?? Date.now;
  const repoUrl = `https://github.com/${repo}`;
  const releasesUrl = `${repoUrl}/releases`;

  let latest: LatestRelease | null = null;
  let checkedAt: number | null = null;
  let error: string | null = null;
  let pending: Promise<void> | null = null;

  function snapshot(): VersionInfo {
    const updateAvailable = Boolean(latest && compareVersions(latest.version, current) > 0);
    return {
      current,
      latest: latest?.version ?? null,
      updateAvailable,
      releaseUrl: latest?.url ?? (latest ? releasesUrl : null),
      releasesUrl,
      repoUrl,
      dockerImage: `ghcr.io/${repo.toLowerCase()}`,
      checkEnabled: enabled,
      checkedAt,
      error,
    };
  }

  function check(): Promise<void> {
    if (!pending) {
      pending = (async () => {
        try {
          latest = await fetchLatest(repo);
          error = null;
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        } finally {
          checkedAt = now();
          pending = null;
        }
      })();
    }
    return pending;
  }

  function isStale(): boolean {
    if (checkedAt === null) return true;
    const maxAge = error ? RETRY_AFTER_ERROR_MS : CHECK_INTERVAL_MS;
    return now() - checkedAt >= maxAge;
  }

  return {
    current,
    async get() {
      if (enabled && isStale()) await check();
      return snapshot();
    },
    async refresh() {
      if (enabled) await check();
      return snapshot();
    },
  };
}
