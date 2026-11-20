import type {
  Feed,
  FeedType,
  FullBackupPayload,
  Health,
  Item,
  ItemsResponse,
  OpmlImportResult,
  RestoreBackupResult,
  ServerSettings,
  SyncResult,
} from './types';

export const UNCATEGORIZED_TOKEN = '__uncategorized__';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 0, 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? 'unknown', res.status, data.message ?? res.statusText);
  }
  return data as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export const api = {
  health: () => request<Health>('GET', '/api/health'),

  getSettings: () => request<{ settings: ServerSettings }>('GET', '/api/settings').then((r) => r.settings),

  updateSettings: (patch: Partial<ServerSettings>) =>
    request<{ settings: ServerSettings; archived: number }>('PATCH', '/api/settings', patch),

  exportBackup: () => request<FullBackupPayload>('GET', '/api/backup'),

  restoreBackup: (payload: FullBackupPayload) =>
    request<RestoreBackupResult>('POST', '/api/backup', payload),

  getFeeds: (type: FeedType, hideShorts: boolean) =>
    request<{ feeds: Feed[] }>('GET', `/api/feeds?${qs({ type, hideShorts })}`).then((r) => r.feeds),

  addFeed: (type: FeedType, url: string, category?: string | null) =>
    request<{ feed: Feed; added: number }>('POST', '/api/feeds', { type, url, category }),

  updateFeedCategory: (id: number, category: string | null) =>
    request<{ feed: Feed }>('PATCH', `/api/feeds/${id}`, { category }).then((r) => r.feed),

  deleteFeed: (id: number) => request<void>('DELETE', `/api/feeds/${id}`),

  sync: (opts: { type?: FeedType; feedId?: number } = {}) => request<SyncResult>('POST', '/api/feeds/sync', opts),

  exportOpmlUrl: (type: FeedType) => `/api/feeds/opml?${qs({ type })}`,

  importOpml: (type: FeedType, opml: string) =>
    request<OpmlImportResult>('POST', '/api/feeds/opml', { type, opml }),

  getItems: (params: {
    type: FeedType;
    feedId?: number | null;
    category?: string | null;
    hideShorts: boolean;
    inboxLimit?: number;
    completedLimit: number;
    completedDays?: number;
  }) => request<ItemsResponse>('GET', `/api/items?${qs(params)}`),

  setCompleted: (id: number, completed: boolean) =>
    request<{ item: Item }>('PATCH', `/api/items/${id}`, { completed }).then((r) => r.item),

  completeAll: (params: {
    type: FeedType;
    feedId?: number | null;
    category?: string | null;
    hideShorts: boolean;
  }) => request<{ updated: number }>('POST', '/api/items/complete-all', params),
};
