import { useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Layers, Plus, Rss, Search, Settings2, X } from 'lucide-react';
import type { Feed, FeedType } from '../types';
import { UNCATEGORIZED_TOKEN } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { useTopics } from '../context/TopicsContext';
import { cn } from '../utils/format';
import { AddFeedDialog, FeedAvatar } from './FeedDialogs';
import { CountBadge, Popover } from './Popover';
import { YouTubeIcon } from './YouTubeIcon';

interface FilterBarProps {
  type: FeedType;
  feeds: Feed[];
  selectedFeedId: number | null;
  onSelect: (id: number | null) => void;
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  onAdd: (url: string, category: string | null) => Promise<string>;
  hideShorts: boolean;
  onHideShortsChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onManageFeeds: () => void;
}

const triggerBase =
  'flex h-10 items-center gap-2 rounded-lg border bg-canvas px-3 text-sm font-medium transition-colors';

function OptionRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        active ? 'bg-accent/15 text-accent' : 'text-fg hover:bg-elevated',
      )}
    >
      {children}
      {active && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}

/** Compact one-row toolbar: search, topic dropdown, channel/feed dropdown, Hide Shorts and Add. */
export function FilterBar(props: FilterBarProps) {
  const {
    type,
    feeds,
    selectedFeedId,
    onSelect,
    selectedCategory,
    onSelectCategory,
    onAdd,
    hideShorts,
    onHideShortsChange,
    search,
    onSearchChange,
    onManageFeeds,
  } = props;
  const { t } = useI18n();
  const { colorOf } = useTopics();
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [feedQuery, setFeedQuery] = useState('');

  const totalUnread = feeds.reduce((sum, f) => sum + f.unreadCount, 0);

  // Topics that are used by feeds of this page type, with unread counts.
  const { topicGroups, uncategorized } = useMemo(() => {
    const map = new Map<string, { name: string; unread: number }>();
    let uncatCount = 0;
    let uncatUnread = 0;
    for (const f of feeds) {
      const cat = f.category?.trim();
      if (!cat) {
        uncatCount += 1;
        uncatUnread += f.unreadCount;
        continue;
      }
      const key = cat.toLocaleLowerCase();
      const entry = map.get(key) ?? { name: cat, unread: 0 };
      entry.unread += f.unreadCount;
      map.set(key, entry);
    }
    return {
      topicGroups: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      uncategorized: uncatCount > 0 ? { unread: uncatUnread } : null,
    };
  }, [feeds]);

  const topicFeeds = useMemo(() => {
    if (!selectedCategory) return feeds;
    if (selectedCategory === UNCATEGORIZED_TOKEN) return feeds.filter((f) => !f.category);
    const key = selectedCategory.toLocaleLowerCase();
    return feeds.filter((f) => f.category?.toLocaleLowerCase() === key);
  }, [feeds, selectedCategory]);

  const topicUnread = topicFeeds.reduce((sum, f) => sum + f.unreadCount, 0);
  const selectedFeed = feeds.find((f) => f.id === selectedFeedId) ?? null;
  const query = feedQuery.trim().toLocaleLowerCase();
  const listedFeeds = query ? topicFeeds.filter((f) => f.title.toLocaleLowerCase().includes(query)) : topicFeeds;

  const selectTopic = (value: string | null) => {
    onSelectCategory(value);
    onSelect(null);
  };

  const topicLabel =
    selectedCategory === null
      ? t('common.allTopics')
      : selectedCategory === UNCATEGORIZED_TOKEN
        ? t('common.uncategorized')
        : selectedCategory;
  const TypeIcon = type === 'youtube' ? YouTubeIcon : Rss;

  return (
    <section className="shrink-0 rounded-xl border border-line bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('common.search')}
            className="h-10 w-full rounded-lg border border-line bg-canvas pl-10 pr-9 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-elevated hover:text-fg"
              aria-label={t('common.clearSearch')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Topic dropdown */}
        {topicGroups.length > 0 && (
          <Popover
            panelClassName="w-64"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label={t('common.topics')}
                className={cn(
                  triggerBase,
                  selectedCategory !== null || open ? 'border-accent/70' : 'border-line hover:border-muted/60',
                )}
              >
                {selectedCategory && selectedCategory !== UNCATEGORIZED_TOKEN ? (
                  <span
                    className={cn('h-2.5 w-2.5 shrink-0 rounded-full', colorOf(selectedCategory).dot)}
                    style={colorOf(selectedCategory).dotStyle}
                  />
                ) : (
                  <Layers className="h-4 w-4 shrink-0 text-muted" />
                )}
                <span className="max-w-[10rem] truncate">{topicLabel}</span>
                <CountBadge value={topicUnread} highlight />
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
              </button>
            )}
          >
            {(close) => (
              <div className="max-h-80 space-y-0.5 overflow-y-auto p-1.5">
                <OptionRow
                  active={selectedCategory === null}
                  onClick={() => {
                    selectTopic(null);
                    close();
                  }}
                >
                  <Layers className="h-4 w-4 shrink-0 text-muted" />
                  <span className="flex-1 truncate">{t('common.allTopics')}</span>
                  <CountBadge value={totalUnread} />
                </OptionRow>
                <div className="my-1 border-t border-line/70" />
                {topicGroups.map((group) => {
                  const active = selectedCategory?.toLocaleLowerCase() === group.name.toLocaleLowerCase();
                  return (
                    <OptionRow
                      key={group.name}
                      active={active}
                      onClick={() => {
                        selectTopic(group.name);
                        close();
                      }}
                    >
                      <span
                        className={cn('h-2.5 w-2.5 shrink-0 rounded-full', colorOf(group.name).dot)}
                        style={colorOf(group.name).dotStyle}
                      />
                      <span className="flex-1 truncate">{group.name}</span>
                      <CountBadge value={group.unread} highlight />
                    </OptionRow>
                  );
                })}
                {uncategorized && (
                  <OptionRow
                    active={selectedCategory === UNCATEGORIZED_TOKEN}
                    onClick={() => {
                      selectTopic(UNCATEGORIZED_TOKEN);
                      close();
                    }}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted" />
                    <span className="flex-1 truncate text-muted">{t('common.uncategorized')}</span>
                    <CountBadge value={uncategorized.unread} highlight />
                  </OptionRow>
                )}
              </div>
            )}
          </Popover>
        )}

        {/* Channel / feed dropdown with search */}
        <Popover
          panelClassName="w-80"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={() => {
                if (!open) setFeedQuery('');
                toggle();
              }}
              aria-expanded={open}
              aria-label={t(`${type}.feedsLabel`)}
              className={cn(
                triggerBase,
                selectedFeed || open ? 'border-accent/70' : 'border-line hover:border-muted/60',
              )}
            >
              {selectedFeed ? (
                <FeedAvatar feed={selectedFeed} size="sm" />
              ) : (
                <TypeIcon className={cn('h-4 w-4 shrink-0', type === 'youtube' ? 'text-youtube' : 'text-warning')} />
              )}
              <span className="max-w-[12rem] truncate">{selectedFeed ? selectedFeed.title : t(`${type}.allFeeds`)}</span>
              <CountBadge value={selectedFeed ? selectedFeed.unreadCount : topicUnread} highlight />
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
            </button>
          )}
        >
          {(close) => (
            <div className="flex max-h-[26rem] flex-col">
              <div className="border-b border-line p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    autoFocus
                    value={feedQuery}
                    onChange={(e) => setFeedQuery(e.target.value)}
                    placeholder={t(`${type}.searchFeeds`)}
                    className="h-9 w-full rounded-lg border border-line bg-canvas pl-8 pr-3 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                {!query && (
                  <>
                    <OptionRow
                      active={selectedFeedId === null}
                      onClick={() => {
                        onSelect(null);
                        close();
                      }}
                    >
                      <TypeIcon
                        className={cn('h-4 w-4 shrink-0', type === 'youtube' ? 'text-youtube' : 'text-warning')}
                      />
                      <span className="flex-1 truncate">{t(`${type}.allFeeds`)}</span>
                      <CountBadge value={topicUnread} />
                    </OptionRow>
                    {listedFeeds.length > 0 && <div className="my-1 border-t border-line/70" />}
                  </>
                )}

                {feeds.length === 0 ? (
                  <p className="px-2.5 py-3 text-sm text-muted">{t(`${type}.noFeeds`)}</p>
                ) : listedFeeds.length === 0 ? (
                  <p className="px-2.5 py-3 text-sm text-muted">{t('common.noMatches')}</p>
                ) : (
                  listedFeeds.map((feed) => (
                    <OptionRow
                      key={feed.id}
                      active={selectedFeedId === feed.id}
                      onClick={() => {
                        onSelect(feed.id);
                        close();
                      }}
                    >
                      <FeedAvatar feed={feed} size="sm" />
                      <span
                        className="flex-1 truncate"
                        title={feed.lastError ? t('common.lastError', { error: feed.lastError }) : undefined}
                      >
                        {feed.title}
                      </span>
                      {feed.lastError && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
                      {selectedCategory === null && feed.category && (
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', colorOf(feed.category).dot)}
                          style={colorOf(feed.category).dotStyle}
                          title={feed.category}
                        />
                      )}
                      <CountBadge value={feed.unreadCount} highlight />
                    </OptionRow>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  close();
                  onManageFeeds();
                }}
                className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs font-semibold text-muted transition-colors hover:bg-elevated hover:text-fg"
              >
                <Settings2 className="h-4 w-4" />
                {t('common.manageFeeds')}
              </button>
            </div>
          )}
        </Popover>

        {/* Hide Shorts toggle */}
        {type === 'youtube' && (
          <button
            type="button"
            role="switch"
            aria-checked={hideShorts}
            onClick={() => onHideShortsChange(!hideShorts)}
            className={cn(triggerBase, 'select-none border-line text-muted hover:border-muted/60 hover:text-fg')}
          >
            <span
              className={cn(
                'inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
                hideShorts ? 'bg-accent' : 'bg-line',
              )}
            >
              <span
                className={cn(
                  'h-4 w-4 rounded-full bg-canvas shadow-xs transition-transform',
                  hideShorts ? 'translate-x-4' : 'translate-x-0',
                )}
              />
            </span>
            <span>{t('common.hideShorts')}</span>
          </button>
        )}

        {/* Add */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          title={t(`${type}.addTitle`)}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-canvas transition-colors hover:bg-accent-strong"
        >
          <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
          <span className="hidden sm:inline">{t(`${type}.addButton`)}</span>
        </button>
      </div>

      {toast && (
        <div className="mt-2.5 flex animate-fade-in items-center gap-2 rounded-lg bg-success/15 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="rounded p-1 opacity-75 hover:opacity-100"
            aria-label={t('common.dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {addOpen && (
        <AddFeedDialog
          type={type}
          initialTopic={selectedCategory && selectedCategory !== UNCATEGORIZED_TOKEN ? selectedCategory : ''}
          onClose={() => setAddOpen(false)}
          onSubmit={onAdd}
          onAdded={setToast}
        />
      )}
    </section>
  );
}
