import type { DatabaseSync } from './db.ts';
import { AppError, errorMessage } from './errors.ts';
import * as repo from './repository.ts';

const GQL_ENDPOINT = 'https://gql.twitch.tv/gql';
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL_BATCH_SIZE = 35;

const HELIX_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_BASE_URL = 'https://api.twitch.tv/helix';
const HELIX_BATCH_SIZE = 100;

const REQUEST_TIMEOUT_MS = 15_000;

const RESERVED_TWITCH_PATHS = new Set([
  'directory',
  'downloads',
  'drops',
  'following',
  'friends',
  'inventory',
  'jobs',
  'login',
  'messages',
  'p',
  'payments',
  'popout',
  'prime',
  'search',
  'settings',
  'signup',
  'subscriptions',
  'turbo',
  'u',
  'videos',
  'wallet',
]);

export type TwitchApiMode = 'helix' | 'gql';

export interface TwitchLiveInfo {
  title: string;
  gameName: string | null;
  viewerCount: number;
  startedAt: string | null;
  thumbnailUrl: string | null;
}

export interface TwitchStreamItem {
  id: number;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  url: string;
  isLive: boolean;
  title: string | null;
  gameName: string | null;
  viewerCount: number | null;
  startedAt: string | null;
  thumbnailUrl: string | null;
  createdAt: number;
}

export interface TwitchStreamsResponse {
  channels: TwitchStreamItem[];
  mode: TwitchApiMode;
  lastSyncedAt: number | null;
  syncing: boolean;
  lastError: string | null;
  pollIntervalMinutes: repo.TwitchPollIntervalMinutes;
}

export interface TwitchImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: { channel: string; error: string }[];
}

interface RemoteChannelInfo {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  live: TwitchLiveInfo | null;
}

export interface TwitchLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface TwitchServiceOptions {
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  logger?: TwitchLogger;
  defaultPollIntervalMinutes?: number;
}

/**
 * Normalizes user input (plain login, @login, or twitch.tv/<login> URL) to a lowercase Twitch login.
 */
export function normalizeTwitchLogin(input: string): string {
  let raw = input.trim();
  if (!raw) {
    throw new AppError('invalid_twitch_channel', 400, 'Please enter a Twitch channel name or URL.');
  }

  if (/^(?:https?:\/\/)?(?:www\.|m\.|go\.)?twitch\.tv\//i.test(raw)) {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try {
      url = new URL(withProto);
    } catch {
      throw new AppError('invalid_twitch_channel', 400, 'Please enter a valid Twitch channel name or URL.');
    }
    const segment = url.pathname.split('/').filter(Boolean)[0] ?? '';
    raw = segment;
  } else if (/^https?:\/\//i.test(raw)) {
    throw new AppError('invalid_twitch_channel', 400, 'This is not a Twitch link.');
  }

  raw = raw.replace(/^@+/, '').toLowerCase();

  if (!/^[a-z0-9_]{1,25}$/.test(raw) || RESERVED_TWITCH_PATHS.has(raw)) {
    throw new AppError(
      'invalid_twitch_channel',
      400,
      'Please enter a valid Twitch channel name (e.g. gronkh or https://www.twitch.tv/gronkh).',
    );
  }

  return raw;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function createTwitchService(db: DatabaseSync, options: TwitchServiceOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger;
  const clientId = options.clientId?.trim() || undefined;
  const clientSecret = options.clientSecret?.trim() || undefined;
  const mode: TwitchApiMode = clientId && clientSecret ? 'helix' : 'gql';
  const defaultPollInterval = repo.normalizeTwitchPollInterval(options.defaultPollIntervalMinutes ?? 15, 15);

  const liveMap = new Map<string, TwitchLiveInfo>();
  let lastSyncedAt: number | null = null;
  let lastError: string | null = null;
  let running: Promise<TwitchStreamsResponse> | null = null;

  let helixToken: { value: string; expiresAt: number } | null = null;
  let helixTokenPromise: Promise<string> | null = null;

  let schedulerTimer: ReturnType<typeof setInterval> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let schedulerActive = false;
  let currentPollIntervalMinutes: repo.TwitchPollIntervalMinutes = repo.getServerSettings(
    db,
    15,
    defaultPollInterval,
  ).twitchPollIntervalMinutes;

  async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; data: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- Helix API ----------

  async function getHelixToken(forceRefresh = false): Promise<string> {
    if (!clientId || !clientSecret) {
      throw new AppError('twitch_fetch_failed', 502, 'Twitch Helix credentials are not configured.');
    }
    if (!forceRefresh && helixToken && Date.now() < helixToken.expiresAt - 60_000) {
      return helixToken.value;
    }
    if (!forceRefresh && helixTokenPromise) {
      return helixTokenPromise;
    }
    helixTokenPromise = (async () => {
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      });
      const { status, data } = await fetchJson(HELIX_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const payload = data as { access_token?: string; expires_in?: number } | null;
      if (status < 200 || status >= 300 || !payload?.access_token) {
        throw new AppError('twitch_fetch_failed', 502, `Failed to obtain Twitch API token (HTTP ${status}).`);
      }
      const expiresInMs = Math.max(Number(payload.expires_in) || 3600, 60) * 1000;
      helixToken = { value: payload.access_token, expiresAt: Date.now() + expiresInMs };
      return helixToken.value;
    })().finally(() => {
      helixTokenPromise = null;
    });
    return helixTokenPromise;
  }

  async function helixGet<T>(pathWithQuery: string, retryOn401 = true): Promise<T> {
    const token = await getHelixToken(false);
    const { status, data } = await fetchJson(`${HELIX_BASE_URL}${pathWithQuery}`, {
      method: 'GET',
      headers: {
        'Client-Id': clientId!,
        Authorization: `Bearer ${token}`,
      },
    });
    if (status === 401 && retryOn401) {
      await getHelixToken(true);
      return helixGet<T>(pathWithQuery, false);
    }
    if (status < 200 || status >= 300 || !data) {
      throw new AppError('twitch_fetch_failed', 502, `Twitch Helix API error (HTTP ${status}).`);
    }
    return data as T;
  }

  async function fetchViaHelix(logins: string[]): Promise<Map<string, RemoteChannelInfo>> {
    const result = new Map<string, RemoteChannelInfo>();
    for (const batch of chunk(logins, HELIX_BATCH_SIZE)) {
      const userQs = batch.map((l) => `login=${encodeURIComponent(l)}`).join('&');
      const streamQs = batch.map((l) => `user_login=${encodeURIComponent(l)}`).join('&');

      const [usersRes, streamsRes] = await Promise.all([
        helixGet<{
          data?: Array<{ login: string; display_name: string; profile_image_url?: string }>;
        }>(`/users?${userQs}`),
        helixGet<{
          data?: Array<{
            user_login: string;
            title?: string;
            game_name?: string;
            viewer_count?: number;
            started_at?: string;
            thumbnail_url?: string;
          }>;
        }>(`/streams?${streamQs}`),
      ]);

      const streamsByLogin = new Map<string, TwitchLiveInfo>();
      for (const s of streamsRes.data ?? []) {
        const key = s.user_login.toLowerCase();
        streamsByLogin.set(key, {
          title: s.title ?? '',
          gameName: s.game_name || null,
          viewerCount: Number(s.viewer_count ?? 0),
          startedAt: s.started_at ?? null,
          thumbnailUrl: s.thumbnail_url ? s.thumbnail_url.replace('{width}', '640').replace('{height}', '360') : null,
        });
      }

      for (const u of usersRes.data ?? []) {
        const key = u.login.toLowerCase();
        result.set(key, {
          login: key,
          displayName: u.display_name || key,
          avatarUrl: u.profile_image_url || null,
          live: streamsByLogin.get(key) ?? null,
        });
      }
    }
    return result;
  }

  // ---------- Public Web-GQL (zero setup) ----------

  async function fetchViaGql(logins: string[]): Promise<Map<string, RemoteChannelInfo>> {
    const result = new Map<string, RemoteChannelInfo>();
    const query = `query($login: String!) {
      user(login: $login) {
        id
        login
        displayName
        profileImageURL(width: 70)
        stream {
          id
          title
          viewersCount
          createdAt
          previewImageURL(width: 640, height: 360)
          game { name }
        }
      }
    }`;

    for (const batch of chunk(logins, GQL_BATCH_SIZE)) {
      const body = batch.map((login) => ({ query, variables: { login } }));
      const { status, data } = await fetchJson(GQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Client-ID': GQL_CLIENT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (status < 200 || status >= 300 || !Array.isArray(data)) {
        throw new AppError('twitch_fetch_failed', 502, `Twitch GQL request failed (HTTP ${status}).`);
      }

      for (const entry of data as Array<{
        data?: {
          user?: {
            login?: string;
            displayName?: string;
            profileImageURL?: string;
            stream?: {
              title?: string;
              viewersCount?: number;
              createdAt?: string;
              previewImageURL?: string;
              game?: { name?: string } | null;
            } | null;
          } | null;
        };
      }>) {
        const user = entry?.data?.user;
        if (!user?.login) continue;
        const key = user.login.toLowerCase();
        const s = user.stream;
        result.set(key, {
          login: key,
          displayName: user.displayName || key,
          avatarUrl: user.profileImageURL || null,
          live: s
            ? {
                title: s.title ?? '',
                gameName: s.game?.name || null,
                viewerCount: Number(s.viewersCount ?? 0),
                startedAt: s.createdAt ?? null,
                thumbnailUrl: s.previewImageURL || null,
              }
            : null,
        });
      }
    }
    return result;
  }

  async function fetchRemoteChannels(logins: string[]): Promise<Map<string, RemoteChannelInfo>> {
    if (logins.length === 0) return new Map();
    return mode === 'helix' ? fetchViaHelix(logins) : fetchViaGql(logins);
  }

  // ---------- Public API ----------

  function buildResponse(): TwitchStreamsResponse {
    const stored = repo.listTwitchChannels(db);
    const items: TwitchStreamItem[] = stored.map((ch) => {
      const live = liveMap.get(ch.login) ?? null;
      return {
        id: ch.id,
        login: ch.login,
        displayName: ch.displayName,
        avatarUrl: ch.avatarUrl,
        url: `https://www.twitch.tv/${ch.login}`,
        isLive: live !== null,
        title: live?.title ?? null,
        gameName: live?.gameName ?? null,
        viewerCount: live?.viewerCount ?? null,
        startedAt: live?.startedAt ?? null,
        thumbnailUrl: live?.thumbnailUrl ?? null,
        createdAt: ch.createdAt,
      };
    });

    items.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      if (a.isLive && b.isLive) {
        const diff = (b.viewerCount ?? 0) - (a.viewerCount ?? 0);
        if (diff !== 0) return diff;
      }
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    });

    return {
      channels: items,
      mode,
      lastSyncedAt,
      syncing: running !== null,
      lastError,
      pollIntervalMinutes: currentPollIntervalMinutes,
    };
  }

  async function refresh(): Promise<TwitchStreamsResponse> {
    if (running) return running;
    running = (async () => {
      const stored = repo.listTwitchChannels(db);
      if (stored.length === 0) {
        liveMap.clear();
        lastSyncedAt = Date.now();
        lastError = null;
        return buildResponse();
      }
      try {
        const remote = await fetchRemoteChannels(stored.map((c) => c.login));
        const nextLogins = new Set(stored.map((c) => c.login));
        for (const existingLogin of liveMap.keys()) {
          if (!nextLogins.has(existingLogin)) liveMap.delete(existingLogin);
        }
        for (const ch of stored) {
          const info = remote.get(ch.login);
          if (!info) {
            liveMap.delete(ch.login);
            continue;
          }
          if (info.displayName !== ch.displayName || info.avatarUrl !== ch.avatarUrl) {
            repo.updateTwitchChannelMeta(db, ch.id, {
              displayName: info.displayName,
              avatarUrl: info.avatarUrl,
            });
          }
          if (info.live) {
            liveMap.set(ch.login, info.live);
          } else {
            liveMap.delete(ch.login);
          }
        }
        lastSyncedAt = Date.now();
        lastError = null;
      } catch (err) {
        lastError = errorMessage(err);
        logger?.warn(`Twitch sync failed (${mode}): ${lastError}`);
      }
      return buildResponse();
    })().finally(() => {
      running = null;
    });
    return running;
  }

  /** Returns the cached stream state without triggering a Twitch request. */
  async function getStreams(): Promise<TwitchStreamsResponse> {
    return buildResponse();
  }

  async function addChannel(input: string): Promise<TwitchStreamItem> {
    const login = normalizeTwitchLogin(input);
    if (repo.findTwitchChannelByLogin(db, login)) {
      throw new AppError('twitch_channel_exists', 409, 'This Twitch channel has already been added.');
    }

    let remote: Map<string, RemoteChannelInfo>;
    try {
      remote = await fetchRemoteChannels([login]);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('twitch_fetch_failed', 502, `Could not look up Twitch channel: ${errorMessage(err)}`);
    }

    const info = remote.get(login);
    if (!info) {
      throw new AppError('twitch_channel_not_found', 404, `Twitch channel "${login}" was not found.`);
    }

    const id = repo.insertTwitchChannel(db, {
      login: info.login,
      displayName: info.displayName,
      avatarUrl: info.avatarUrl,
    });

    if (info.live) {
      liveMap.set(info.login, info.live);
    } else {
      liveMap.delete(info.login);
    }
    if (lastSyncedAt === null) {
      lastSyncedAt = Date.now();
    }

    const created = repo.getTwitchChannel(db, id)!;
    return {
      id: created.id,
      login: created.login,
      displayName: created.displayName,
      avatarUrl: created.avatarUrl,
      url: `https://www.twitch.tv/${created.login}`,
      isLive: info.live !== null,
      title: info.live?.title ?? null,
      gameName: info.live?.gameName ?? null,
      viewerCount: info.live?.viewerCount ?? null,
      startedAt: info.live?.startedAt ?? null,
      thumbnailUrl: info.live?.thumbnailUrl ?? null,
      createdAt: created.createdAt,
    };
  }

  function removeChannel(id: number): boolean {
    const existing = repo.getTwitchChannel(db, id);
    if (!existing) return false;
    const deleted = repo.deleteTwitchChannel(db, id);
    if (deleted) {
      liveMap.delete(existing.login);
    }
    return deleted;
  }

  /**
   * Imports Twitch channels from either an exported JSON file ({ channels: [...] } or string[])
   * or a plain text list (one channel name or twitch.tv/<name> URL per line).
   */
  async function importChannels(rawContent: string): Promise<TwitchImportResult> {
    const rawInputs: string[] = [];
    const trimmed = rawContent.trim();
    if (!trimmed) {
      throw new AppError('invalid_twitch_import', 400, 'Please provide a valid Twitch channels file.');
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new AppError('invalid_twitch_import', 400, 'Invalid JSON file.');
      }
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { channels?: unknown }).channels)
          ? (parsed as { channels: unknown[] }).channels
          : null;
      if (!list) {
        throw new AppError('invalid_twitch_import', 400, 'No Twitch channels found in this JSON file.');
      }
      for (const entry of list) {
        if (typeof entry === 'string') {
          rawInputs.push(entry);
        } else if (entry && typeof entry === 'object' && typeof (entry as { login?: unknown }).login === 'string') {
          rawInputs.push((entry as { login: string }).login);
        }
      }
    } else {
      for (const line of trimmed.split(/\r?\n/)) {
        const clean = line.trim();
        if (!clean || clean.startsWith('#')) continue;
        rawInputs.push(clean);
      }
    }

    if (rawInputs.length === 0) {
      throw new AppError('invalid_twitch_import', 400, 'No Twitch channels found in this file.');
    }

    const errors: { channel: string; error: string }[] = [];
    const candidates: string[] = [];
    const seen = new Set<string>();
    let skipped = 0;

    for (const entry of rawInputs) {
      let login: string;
      try {
        login = normalizeTwitchLogin(entry);
      } catch (err) {
        errors.push({ channel: entry, error: errorMessage(err) });
        continue;
      }
      if (seen.has(login) || repo.findTwitchChannelByLogin(db, login)) {
        skipped += 1;
        continue;
      }
      seen.add(login);
      candidates.push(login);
    }

    let imported = 0;
    if (candidates.length > 0) {
      let remote: Map<string, RemoteChannelInfo>;
      try {
        remote = await fetchRemoteChannels(candidates);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError('twitch_fetch_failed', 502, `Could not look up Twitch channels: ${errorMessage(err)}`);
      }

      for (const login of candidates) {
        const info = remote.get(login);
        if (!info) {
          errors.push({ channel: login, error: `Twitch channel "${login}" was not found.` });
          continue;
        }
        repo.insertTwitchChannel(db, {
          login: info.login,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
        });
        if (info.live) {
          liveMap.set(info.login, info.live);
        }
        imported += 1;
      }
      if (imported > 0 && lastSyncedAt === null) {
        lastSyncedAt = Date.now();
      }
    }

    return {
      imported,
      skipped,
      failed: errors.length,
      errors,
    };
  }

  // ---------- Background Scheduler ----------

  function applySchedulerTimer() {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    if (!schedulerActive) return;
    const ms = currentPollIntervalMinutes * 60_000;
    schedulerTimer = setInterval(() => {
      void refresh();
    }, ms);
    schedulerTimer.unref?.();
  }

  function setPollInterval(minutes: repo.TwitchPollIntervalMinutes) {
    currentPollIntervalMinutes = repo.normalizeTwitchPollInterval(minutes, 15);
    applySchedulerTimer();
    logger?.info(`Twitch background sync interval updated to every ${currentPollIntervalMinutes} minutes`);
  }

  function startScheduler(fallbackIntervalMinutes: number = defaultPollInterval) {
    schedulerActive = true;
    currentPollIntervalMinutes = repo.getServerSettings(db, 15, fallbackIntervalMinutes).twitchPollIntervalMinutes;
    applySchedulerTimer();

    startupTimer = setTimeout(() => {
      if (repo.listTwitchChannels(db).length > 0) {
        void refresh();
      }
    }, 3_000);
    startupTimer.unref?.();

    return () => {
      schedulerActive = false;
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
      if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
      }
    };
  }

  function getSyncState() {
    return {
      mode,
      twitchPollIntervalMinutes: currentPollIntervalMinutes,
      lastTwitchSyncAt: lastSyncedAt,
      twitchSyncing: running !== null,
    };
  }

  return {
    mode,
    getStreams,
    refresh,
    addChannel,
    removeChannel,
    importChannels,
    startScheduler,
    setPollInterval,
    getSyncState,
  };
}

export type TwitchService = ReturnType<typeof createTwitchService>;
