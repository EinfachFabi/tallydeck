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

export interface Health {
  status: string;
  version: string;
  pollIntervalMinutes: number | null;
  lastSyncAt: number | null;
  syncing: boolean;
}
