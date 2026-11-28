/**
 * Update check against GHCR container package tags and GitHub repository version tags.
 *
 * TallyDeck publishes tagged container packages to `ghcr.io` (and version git tags) rather
 * than GitHub Releases. The server checks for the newest `X.Y.Z` version tag at most every
 * `CHECK_INTERVAL_MS` and caches the answer. Failed checks are retried sooner.
 * There is no auto-update: the UI only shows a hint plus the matching docker command.
 */

export interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  /** Package page of the latest version (falls back to the packages overview). */
  packageUrl: string | null;
  /** GitHub Packages overview page for the container image. */
  packagesUrl: string;
  repoUrl: string;
  /** Container image without tag, e.g. ghcr.io/einfachfabi/tallydeck */
  dockerImage: string;
  checkEnabled: boolean;
  checkedAt: number | null;
  error: string | null;
}

export interface LatestPackageVersion {
  version: string;
  url: string | null;
}

/** Injectable fetcher for the latest version tag (replaced in tests). Returns null if no version tag exists. */
export type FetchLatestVersion = (repo: string) => Promise<LatestPackageVersion | null>;

export interface VersionServiceOptions {
  current: string;
  /** GitHub "owner/name" */
  repo: string;
  enabled: boolean;
  fetchLatest?: FetchLatestVersion;
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
const VERSION_TAG_RE = /^v?(\d+\.\d+\.\d+)$/i;

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

/** Picks the highest `X.Y.Z` / `vX.Y.Z` version tag, ignoring `latest`, `X.Y`, or commit-SHA tags. */
export function pickLatestVersionTag(tags: readonly string[]): string | null {
  let best: string | null = null;
  for (const raw of tags) {
    const match = VERSION_TAG_RE.exec(raw.trim());
    if (!match) continue;
    const version = match[1];
    if (best === null || compareVersions(version, best) > 0) {
      best = version;
    }
  }
  return best;
}

export function buildPackagesUrl(repo: string): string {
  const packageName = (repo.split('/')[1] ?? repo).toLowerCase();
  return `https://github.com/${repo}/pkgs/container/${packageName}`;
}

/** Queries the public GHCR OCI registry for version tags of `ghcr.io/<owner>/<repo>`. */
async function fetchGhcrVersionTags(repo: string): Promise<string[] | null> {
  const image = repo.toLowerCase();
  const tokenRes = await fetch(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${image}:pull`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TallyDeck-UpdateCheck',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (tokenRes.status === 401 || tokenRes.status === 403 || tokenRes.status === 404) {
    return null;
  }
  if (!tokenRes.ok) {
    throw new Error(`GHCR token endpoint responded with HTTP ${tokenRes.status}`);
  }
  const tokenData = (await tokenRes.json()) as { token?: unknown; access_token?: unknown };
  const token =
    typeof tokenData.token === 'string'
      ? tokenData.token
      : typeof tokenData.access_token === 'string'
        ? tokenData.access_token
        : null;
  if (!token) return null;

  const tagsRes = await fetch(`https://ghcr.io/v2/${image}/tags/list?n=1000`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'TallyDeck-UpdateCheck',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (tagsRes.status === 401 || tagsRes.status === 403 || tagsRes.status === 404) {
    return null;
  }
  if (!tagsRes.ok) {
    throw new Error(`GHCR API responded with HTTP ${tagsRes.status}`);
  }
  const data = (await tagsRes.json()) as { tags?: unknown };
  if (!Array.isArray(data.tags)) return [];
  return data.tags.filter((t): t is string => typeof t === 'string');
}

/** Queries GitHub repository tags (`/repos/:owner/:repo/tags`) for version tags. */
async function fetchGitHubRepoTags(repo: string): Promise<string[] | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=100`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TallyDeck-UpdateCheck',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API responded with HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string');
}

export const defaultFetchLatest: FetchLatestVersion = async (repo) => {
  const [ghcrResult, gitTagsResult] = await Promise.allSettled([
    fetchGhcrVersionTags(repo),
    fetchGitHubRepoTags(repo),
  ]);

  const collected: string[] = [];
  if (ghcrResult.status === 'fulfilled' && ghcrResult.value) {
    collected.push(...ghcrResult.value);
  }
  if (gitTagsResult.status === 'fulfilled' && gitTagsResult.value) {
    collected.push(...gitTagsResult.value);
  }

  if (ghcrResult.status === 'rejected' && gitTagsResult.status === 'rejected') {
    throw ghcrResult.reason instanceof Error ? ghcrResult.reason : new Error(String(ghcrResult.reason));
  }

  const version = pickLatestVersionTag(collected);
  if (!version) return null;
  return {
    version,
    url: buildPackagesUrl(repo),
  };
};

export function createVersionService(options: VersionServiceOptions): VersionService {
  const { current, repo, enabled } = options;
  const fetchLatest = options.fetchLatest ?? defaultFetchLatest;
  const now = options.now ?? Date.now;
  const repoUrl = `https://github.com/${repo}`;
  const packagesUrl = buildPackagesUrl(repo);

  let latest: LatestPackageVersion | null = null;
  let checkedAt: number | null = null;
  let error: string | null = null;
  let pending: Promise<void> | null = null;

  function snapshot(): VersionInfo {
    const updateAvailable = Boolean(latest && compareVersions(latest.version, current) > 0);
    return {
      current,
      latest: latest?.version ?? null,
      updateAvailable,
      packageUrl: latest?.url ?? (latest ? packagesUrl : null),
      packagesUrl,
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
