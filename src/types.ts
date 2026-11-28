export type FeedType = 'youtube' | 'rss';

export interface Feed {
  id: number;
  type: FeedType;
  title: string;
  feedUrl: string;
  sourceUrl: string | null;
  siteUrl: string | null;
  channelId: string | null;
  iconUrl: string | null;
  category: string | null;
  lastFetchedAt: number | null;
  lastError: string | null;
  createdAt: number;
  unreadCount: number;
  totalCount: number;
}

export interface Item {
  id: number;
  feedId: number;
  feedTitle: string;
  feedIconUrl: string | null;
  feedCategory: string | null;
  externalId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  author: string | null;
  summary: string | null;
  publishedAt: number | null;
  isShort: boolean;
  isCompleted: boolean;
  completedAt: number | null;
  createdAt: number;
}

export interface Stats {
  totalCompleted: number;
  completedThisWeek: number;
  completedLastWeek: number;
  avgPerWeek: number;
  pendingCount: number;
  feedCount: number;
  weekly: number[];
}

export interface ItemsResponse {
  uncompleted: Item[];
  completed: Item[];
  completedTotal: number;
  stats: Stats;
}

export interface SyncResult {
  added: number;
  feeds: number;
  errors: { feedId: number; title: string; error: string }[];
  finishedAt: number;
}

export interface OpmlImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: { url: string; error: string }[];
}

export type PollIntervalMinutes = 0 | 5 | 15 | 30 | 60;
export type TwitchPollIntervalMinutes = 15 | 30 | 60 | 120;

export interface ServerSettings {
  pollIntervalMinutes: PollIntervalMinutes;
  twitchPollIntervalMinutes: TwitchPollIntervalMinutes;
  autoArchiveEnabled: boolean;
  autoArchiveDays: number;
}

export interface TwitchStream {
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
  channels: TwitchStream[];
  mode: 'helix' | 'gql';
  lastSyncedAt: number | null;
  syncing: boolean;
  lastError: string | null;
  pollIntervalMinutes: TwitchPollIntervalMinutes;
}

export interface TwitchImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: { channel: string; error: string }[];
}

export interface FullBackupPayload {
  app: 'tallydeck';
  version: number;
  exportedAt: number;
  serverSettings?: Partial<ServerSettings>;
  clientSettings?: Record<string, unknown>;
  feeds: unknown[];
  items: unknown[];
}

export interface RestoreBackupResult {
  feedsRestored: number;
  itemsRestored: number;
  serverSettings: ServerSettings;
}

export interface Health {
  status: string;
  version: string;
  pollIntervalMinutes: number | null;
  lastSyncAt: number | null;
  syncing: boolean;
  lastTwitchSyncAt?: number | null;
  twitchSyncing?: boolean;
}

/** Palette index (0..15), custom #rrggbb hex color, or null = automatic color. */
export type TopicColor = number | string | null;

export interface Topic {
  name: string;
  color: TopicColor;
  youtubeCount: number;
  rssCount: number;
}

export interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  packageUrl: string | null;
  packagesUrl: string;
  repoUrl: string;
  dockerImage: string;
  checkEnabled: boolean;
  checkedAt: number | null;
  error: string | null;
}
