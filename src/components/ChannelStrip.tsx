import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Folder,
  LoaderCircle,
  Plus,
  Rss,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { Feed, FeedType } from '../types';
import { UNCATEGORIZED_TOKEN } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { cn } from '../utils/format';
import { getTopicColor } from '../utils/topicColor';
import { YouTubeIcon } from './YouTubeIcon';

interface ChannelStripProps {
  type: FeedType;
  feeds: Feed[];
  selectedFeedId: number | null;
  onSelect: (id: number | null) => void;
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  onAdd: (url: string, category: string | null) => Promise<string>;
  onUpdateCategory: (feed: Feed, category: string | null) => Promise<void>;
  onDelete: (feed: Feed) => Promise<void>;
  hideShorts: boolean;
  onHideShortsChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

function FeedAvatar({ feed, type }: { feed: Feed; type: FeedType }) {
  const [broken, setBroken] = useState(false);
  if (feed.iconUrl && !broken) {
    return (
      <img
        src={feed.iconUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-6 w-6 shrink-0 rounded-full bg-elevated object-cover"
      />
    );
  }
  const Icon = type === 'youtube' ? YouTubeIcon : Rss;
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated">
      <Icon className={cn('h-3.5 w-3.5', type === 'youtube' ? 'text-youtube' : 'text-warning')} />
    </span>
  );
}

function TopicPicker({
  value,
  onChange,
  suggestions,
  placeholder,
  noTopicLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
  placeholder: string;
  noTopicLabel: string;
}) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-canvas px-3.5 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            value.trim() === ''
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-line text-muted hover:border-muted/60 hover:text-fg',
          )}
        >
          {noTopicLabel}
        </button>
        {suggestions.map((topic) => {
          const active = value.trim().toLowerCase() === topic.toLowerCase();
          const color = getTopicColor(topic);
          return (
            <button
              key={topic}
              type="button"
              onClick={() => onChange(active ? '' : topic)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active ? color.pillActive : color.badge + ' opacity-80 hover:opacity-100',
              )}
            >
              {topic}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChannelStrip(props: ChannelStripProps) {
  const {
    type,
    feeds,
    selectedFeedId,
    onSelect,
    selectedCategory,
    onSelectCategory,
    onAdd,
    onUpdateCategory,
    onDelete,
    hideShorts,
    onHideShortsChange,
    search,
    onSearchChange,
  } = props;
  const { t } = useI18n();

  // Add-feed modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Edit-topic modal for an existing feed
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const [editCategoryInput, setEditCategoryInput] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Delete confirmation popup for a feed / channel
  const [deletingFeed, setDeletingFeed] = useState<Feed | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Overflow detection for subscribed feeds row
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const totalUnread = feeds.reduce((sum, f) => sum + f.unreadCount, 0);

  // Build list of active topics with unread counts + suggestion chips
  const { topicGroups, hasUncategorized, uncategorizedUnread, topicSuggestions } = useMemo(() => {
    const map = new Map<string, { name: string; unread: number; count: number }>();
    let uncatCount = 0;
    let uncatUnread = 0;

    for (const f of feeds) {
      const cat = f.category?.trim();
      if (!cat) {
        uncatCount += 1;
        uncatUnread += f.unreadCount;
        continue;
      }
      const key = cat.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.unread += f.unreadCount;
        existing.count += 1;
      } else {
        map.set(key, { name: cat, unread: f.unreadCount, count: 1 });
      }
    }

    const groups = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    const presets = t('common.presetTopics')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const item of [...groups.map((g) => g.name), ...presets]) {
      const lower = item.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        suggestions.push(item);
      }
    }

    return {
      topicGroups: groups,
      hasUncategorized: uncatCount > 0,
      uncategorizedUnread: uncatUnread,
      topicSuggestions: suggestions,
    };
  }, [feeds, t]);

  // Feeds visible under the selected topic
  const visibleFeeds = useMemo(() => {
    if (!selectedCategory) return feeds;
    if (selectedCategory === UNCATEGORIZED_TOKEN) {
      return feeds.filter((f) => !f.category);
    }
    return feeds.filter((f) => f.category?.toLowerCase() === selectedCategory.toLowerCase());
  }, [feeds, selectedCategory]);

  const visibleUnread = visibleFeeds.reduce((sum, f) => sum + f.unreadCount, 0);

  useEffect(() => {
    if (modalOpen) {
      setModalError(null);
      setCategoryInput(
        selectedCategory && selectedCategory !== UNCATEGORIZED_TOKEN ? selectedCategory : '',
      );
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [modalOpen, selectedCategory]);

  useEffect(() => {
    if (!modalOpen && !editingFeed && !deletingFeed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalOpen && !adding) setModalOpen(false);
        if (editingFeed && !savingCategory) setEditingFeed(null);
        if (deletingFeed && !deleting) setDeletingFeed(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, adding, editingFeed, savingCategory, deletingFeed, deleting]);

  // Measure whether the single-row height overflows with more feeds
  useEffect(() => {
    const el = listRef.current;
    if (!el) {
      setHasOverflow(false);
      return;
    }
    const check = () => {
      setHasOverflow(el.scrollHeight > 48);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visibleFeeds, expanded]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || adding) return;
    setAdding(true);
    setModalError(null);
    try {
      const cat = categoryInput.trim() || null;
      const text = await onAdd(url.trim(), cat);
      setUrl('');
      setModalOpen(false);
      setToast(text);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function submitCategoryEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingFeed || savingCategory) return;
    setSavingCategory(true);
    try {
      await onUpdateCategory(editingFeed, editCategoryInput.trim() || null);
      setEditingFeed(null);
    } finally {
      setSavingCategory(false);
    }
  }

  async function confirmDeleteFeed() {
    if (!deletingFeed || deleting) return;
    setDeleting(true);
    try {
      await onDelete(deletingFeed);
      setDeletingFeed(null);
    } finally {
      setDeleting(false);
    }
  }

  const pillBase =
    'group flex h-9 max-w-[19rem] items-center gap-2 rounded-full border py-1 pl-2 pr-3 text-sm font-medium transition-colors';

  return (
    <section className="shrink-0 space-y-2.5 rounded-xl border border-line bg-surface p-3.5">
      {/* Row 1: Search bar on the left, Hide Shorts + Add button on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('common.search')}
            className="w-full rounded-lg border border-line bg-canvas py-2.5 pl-11 pr-9 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-elevated hover:text-fg"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {type === 'youtube' && (
            <button
              type="button"
              role="switch"
              aria-checked={hideShorts}
              onClick={() => onHideShortsChange(!hideShorts)}
              className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-sm font-medium text-muted transition-colors hover:border-muted/60 hover:text-fg"
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

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-canvas transition-colors hover:bg-accent-strong"
          >
            <Plus className="h-5 w-5 stroke-[2.25]" />
            <span>{t(`${type}.addButton`)}</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className="flex animate-fade-in items-center gap-2 rounded-lg bg-success/15 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="rounded p-1 opacity-75 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Row 2 (when topics exist): Topic / Category filter bar */}
      {topicGroups.length > 0 && (
        <div className="flex items-center gap-2.5 border-b border-line/60 pb-2.5">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('common.topics')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectCategory(null);
                onSelect(null);
              }}
              className={cn(
                'flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
                selectedCategory === null
                  ? 'border-purple bg-purple/20 text-purple'
                  : 'border-line text-muted hover:border-muted/60 hover:text-fg',
              )}
            >
              <span>{t('common.all')}</span>
              <span className="rounded-full bg-canvas/70 px-1.5 py-0.5 text-[11px] tabular-nums">
                {totalUnread}
              </span>
            </button>

            {topicGroups.map((group) => {
              const active = selectedCategory?.toLowerCase() === group.name.toLowerCase();
              const color = getTopicColor(group.name);
              return (
                <button
                  key={group.name}
                  type="button"
                  onClick={() => {
                    onSelectCategory(active ? null : group.name);
                    onSelect(null);
                  }}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
                    active ? color.pillActive : color.pillIdle,
                  )}
                >
                  <Folder className={cn('h-3.5 w-3.5', color.icon)} />
                  <span>{group.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
                      group.unread > 0 ? color.count : 'bg-canvas/70 text-muted',
                    )}
                  >
                    {group.unread}
                  </span>
                </button>
              );
            })}

            {hasUncategorized && (
              <button
                type="button"
                onClick={() => {
                  const active = selectedCategory === UNCATEGORIZED_TOKEN;
                  onSelectCategory(active ? null : UNCATEGORIZED_TOKEN);
                  onSelect(null);
                }}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
                  selectedCategory === UNCATEGORIZED_TOKEN
                    ? 'border-purple bg-purple/20 text-purple'
                    : 'border-line text-muted hover:border-muted/60 hover:text-fg',
                )}
              >
                <span>{t('common.uncategorized')}</span>
                <span className="rounded-full bg-canvas/70 px-1.5 py-0.5 text-[11px] tabular-nums">
                  {uncategorizedUnread}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Row 3: Subscribed channels / feeds (filtered by selected topic) with right-end overflow arrow button */}
      <div className="flex items-start gap-2.5">
        <span className="mt-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
          {t(`${type}.feedsLabel`)}
        </span>

        {feeds.length === 0 ? (
          <p className="mt-1.5 flex-1 text-sm text-muted">{t(`${type}.noFeeds`)}</p>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div
              ref={listRef}
              className={cn(
                'flex min-w-0 flex-1 flex-wrap gap-2 transition-all',
                !expanded && 'max-h-9 overflow-hidden',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(null)}
                className={cn(
                  pillBase,
                  'pl-3.5',
                  selectedFeedId === null
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line text-muted hover:border-muted/60 hover:text-fg',
                )}
              >
                {t('common.all')}
                <span className="rounded-full bg-canvas/70 px-2 py-0.5 text-xs tabular-nums">
                  {visibleUnread}
                </span>
              </button>

              {visibleFeeds.map((feed) => {
                const active = selectedFeedId === feed.id;
                return (
                  <div
                    key={feed.id}
                    className={cn(
                      pillBase,
                      'cursor-pointer',
                      active
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-line text-fg/90 hover:border-muted/60',
                    )}
                    onClick={() => onSelect(active ? null : feed.id)}
                    title={
                      feed.lastError
                        ? t('common.lastError', { error: feed.lastError })
                        : (feed.sourceUrl ?? feed.feedUrl)
                    }
                  >
                    <FeedAvatar feed={feed} type={type} />
                    <span className="truncate">{feed.title}</span>
                    {selectedCategory === null && feed.category && (
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
                          getTopicColor(feed.category).badge,
                        )}
                      >
                        {feed.category}
                      </span>
                    )}
                    {feed.lastError && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs tabular-nums',
                        feed.unreadCount > 0 ? 'bg-accent/20 text-accent' : 'bg-canvas/70 text-muted',
                      )}
                    >
                      {feed.unreadCount}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFeed(feed);
                        setEditCategoryInput(feed.category ?? '');
                      }}
                      className="hidden rounded-full p-1 text-muted hover:bg-purple/20 hover:text-purple group-hover:block"
                      aria-label={t('common.changeTopic')}
                      title={t('common.changeTopic')}
                    >
                      <Tag className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingFeed(feed);
                      }}
                      className="-mr-1 hidden rounded-full p-1 text-muted hover:bg-danger/20 hover:text-danger group-hover:block"
                      aria-label={t('common.remove')}
                      title={t('common.remove')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {(hasOverflow || expanded) && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? t('common.showLessFeeds') : t('common.showMoreFeeds')}
                aria-label={expanded ? t('common.showLessFeeds') : t('common.showMoreFeeds')}
                aria-expanded={expanded}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated text-fg transition-colors hover:border-accent hover:text-accent"
              >
                {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Overlay / Modal for adding a YouTube channel or RSS feed */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => !adding && setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-feed-title"
            className="w-full max-w-lg animate-fade-in rounded-2xl border border-line bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="add-feed-title" className="text-base font-semibold">
                {t(`${type}.addTitle`)}
              </h3>
              <button
                type="button"
                disabled={adding}
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg"
                aria-label={t('common.cancel')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-1.5 text-xs text-muted">{t(`${type}.addHint`)}</p>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <input
                ref={inputRef}
                type="text"
                autoFocus
                disabled={adding}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t(`${type}.addPlaceholder`)}
                className="w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  {t('common.topicLabel')}
                </label>
                <TopicPicker
                  value={categoryInput}
                  onChange={setCategoryInput}
                  suggestions={topicSuggestions}
                  placeholder={t('common.topicPlaceholder')}
                  noTopicLabel={t('common.noTopic')}
                />
              </div>

              {modalError && (
                <div className="flex items-center gap-2 rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-elevated hover:text-fg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={adding || !url.trim()}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>{t(`${type}.addButton`)}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overlay / Modal for assigning or changing a feed's topic */}
      {editingFeed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => !savingCategory && setEditingFeed(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md animate-fade-in rounded-2xl border border-line bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate text-base font-semibold">
                {t('common.changeTopicFor', { title: editingFeed.title })}
              </h3>
              <button
                type="button"
                disabled={savingCategory}
                onClick={() => setEditingFeed(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg"
                aria-label={t('common.cancel')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitCategoryEdit} className="mt-4 space-y-4">
              <TopicPicker
                value={editCategoryInput}
                onChange={setEditCategoryInput}
                suggestions={topicSuggestions}
                placeholder={t('common.topicPlaceholder')}
                noTopicLabel={t('common.noTopic')}
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingCategory}
                  onClick={() => setEditingFeed(null)}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-elevated hover:text-fg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:bg-accent-strong"
                >
                  {savingCategory && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  <span>{t('common.save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Popup / Modal when removing a YouTube channel or RSS feed */}
      {deletingFeed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => !deleting && setDeletingFeed(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-feed-title"
            className="w-full max-w-md animate-fade-in rounded-2xl border border-line bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
                  <Trash2 className="h-5 w-5" />
                </span>
                <h3 id="delete-feed-title" className="text-base font-semibold">
                  {t(`${type}.deleteTitle`)}
                </h3>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingFeed(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg"
                aria-label={t('common.cancel')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-sm text-muted">
              {t(`${type}.confirmDelete`, { title: deletingFeed.title })}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingFeed(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-elevated hover:text-fg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteFeed()}
                className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>{t('common.deleteConfirmButton')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
