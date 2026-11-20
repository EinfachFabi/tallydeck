import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Feed, FeedType, Item, ItemsResponse } from '../types';
import { api, UNCATEGORIZED_TOKEN } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { useSettings } from '../context/SettingsContext';
import { errorText } from '../utils/format';
import { useLocalStorage } from '../utils/useLocalStorage';
import { StatsBar } from '../components/StatsBar';
import { ChannelStrip } from '../components/ChannelStrip';
import { SplitFeedTables } from '../components/SplitFeedTables';

const AUTO_REFRESH_MS = 60_000;
const COMPLETED_PAGE = 100;

interface DashboardPageProps {
  type: FeedType;
  /** Changes when a sync happened somewhere -> reload. */
  refreshKey: number;
}

export function DashboardPage({ type, refreshKey }: DashboardPageProps) {
  const { t } = useI18n();
  const { inboxLimit, completedDays } = useSettings();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hideShorts, setHideShorts] = useLocalStorage(`tallydeck.${type}.hideShorts`, type === 'youtube');
  const [completedLimit, setCompletedLimit] = useState(COMPLETED_PAGE);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const effectiveHideShorts = type === 'youtube' && hideShorts;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [nextFeeds, nextData] = await Promise.all([
        api.getFeeds(type, effectiveHideShorts),
        api.getItems({
          type,
          feedId: selectedFeedId,
          category: selectedCategory,
          hideShorts: effectiveHideShorts,
          inboxLimit,
          completedLimit,
          completedDays,
        }),
      ]);
      if (id !== requestId.current) return; // a newer request is in flight
      setFeeds(nextFeeds);
      setData(nextData);
      setError(null);
    } catch (err) {
      if (id === requestId.current) setError(errorText(err, t));
    }
  }, [type, effectiveHideShorts, selectedFeedId, selectedCategory, inboxLimit, completedLimit, completedDays, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Periodic refresh + refresh when the tab becomes visible again.
  useEffect(() => {
    const interval = setInterval(load, AUTO_REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // If the selected feed or category no longer exists, fall back to "All".
  useEffect(() => {
    if (selectedFeedId !== null && feeds.length > 0 && !feeds.some((f) => f.id === selectedFeedId)) {
      setSelectedFeedId(null);
    }
    if (selectedCategory !== null && feeds.length > 0) {
      const exists =
        selectedCategory === UNCATEGORIZED_TOKEN
          ? feeds.some((f) => !f.category)
          : feeds.some((f) => f.category?.toLowerCase() === selectedCategory.toLowerCase());
      if (!exists) setSelectedCategory(null);
    }
  }, [feeds, selectedFeedId, selectedCategory]);

  const toggle = useCallback(
    async (item: Item, completed: boolean) => {
      // Optimistic: move the row immediately between the two tables.
      setData((prev) => {
        if (!prev) return prev;
        const moved = { ...item, isCompleted: completed, completedAt: completed ? Date.now() : null };
        return completed
          ? {
              ...prev,
              uncompleted: prev.uncompleted.filter((i) => i.id !== item.id),
              completed: [moved, ...prev.completed],
              completedTotal: prev.completedTotal + 1,
            }
          : {
              ...prev,
              completed: prev.completed.filter((i) => i.id !== item.id),
              completedTotal: Math.max(0, prev.completedTotal - 1),
              uncompleted: [moved, ...prev.uncompleted].sort(
                (a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt),
              ),
            };
      });
      try {
        await api.setCompleted(item.id, completed);
      } catch (err) {
        setError(errorText(err, t));
      }
      void load(); // refresh stats + counters
    },
    [load, t],
  );

  const completeAll = useCallback(async () => {
    const count = data?.uncompleted.length ?? 0;
    if (!count || !window.confirm(t(`${type}.confirmMarkAll`, { count }))) return;
    try {
      await api.completeAll({
        type,
        feedId: selectedFeedId,
        category: selectedCategory,
        hideShorts: effectiveHideShorts,
      });
    } catch (err) {
      setError(errorText(err, t));
    }
    void load();
  }, [data, type, selectedFeedId, selectedCategory, effectiveHideShorts, load, t]);

  const addFeed = useCallback(
    async (url: string, category: string | null) => {
      try {
        const result = await api.addFeed(type, url, category);
        await load();
        return t(`${type}.added`, { title: result.feed.title, count: result.added });
      } catch (err) {
        throw new Error(errorText(err, t));
      }
    },
    [type, load, t],
  );

  const updateCategory = useCallback(
    async (feed: Feed, category: string | null) => {
      try {
        await api.updateFeedCategory(feed.id, category);
        await load();
      } catch (err) {
        setError(errorText(err, t));
      }
    },
    [load, t],
  );

  const deleteFeed = useCallback(
    async (feed: Feed) => {
      try {
        await api.deleteFeed(feed.id);
        if (selectedFeedId === feed.id) setSelectedFeedId(null);
      } catch (err) {
        setError(errorText(err, t));
      }
      await load();
    },
    [selectedFeedId, load, t],
  );

  const syncFeeds = useCallback(async () => {
    setSyncing(true);
    try {
      await api.sync({ type });
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setSyncing(false);
      await load();
    }
  }, [type, load, t]);

  // Client-side title/channel/topic search on top of the server-side filters.
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const match = (i: Item) =>
      !query ||
      i.title.toLowerCase().includes(query) ||
      i.feedTitle.toLowerCase().includes(query) ||
      (i.feedCategory?.toLowerCase().includes(query) ?? false);
    return {
      uncompleted: (data?.uncompleted ?? []).filter(match),
      completed: (data?.completed ?? []).filter(match),
    };
  }, [data, query]);

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-3.5 p-4 md:p-5 xl:h-full xl:overflow-hidden">
      <StatsBar type={type} stats={data?.stats ?? null} />

      <ChannelStrip
        type={type}
        feeds={feeds}
        selectedFeedId={selectedFeedId}
        onSelect={setSelectedFeedId}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onAdd={addFeed}
        onUpdateCategory={updateCategory}
        onDelete={deleteFeed}
        hideShorts={hideShorts}
        onHideShortsChange={setHideShorts}
        search={search}
        onSearchChange={setSearch}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load()} className="rounded px-2 py-0.5 hover:bg-danger/20">
            {t('common.retry')}
          </button>
        </div>
      )}

      <SplitFeedTables
        type={type}
        uncompleted={filtered.uncompleted}
        completed={filtered.completed}
        completedTotal={query ? filtered.completed.length : (data?.completedTotal ?? 0)}
        completedDays={completedDays}
        onToggle={toggle}
        onCompleteAll={completeAll}
        onSync={() => void syncFeeds()}
        syncing={syncing}
        onLoadMore={() => setCompletedLimit((l) => l + COMPLETED_PAGE)}
        searching={Boolean(query)}
      />
    </div>
  );
}
