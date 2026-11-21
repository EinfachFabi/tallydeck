import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Rss,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import type { Feed, FeedType, Topic, TopicColor } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { useTopics } from '../context/TopicsContext';
import { cn, errorText } from '../utils/format';
import { autoTopicColorIndex, getTopicColor, normalizeHexColor, TOPIC_PALETTE } from '../utils/topicColor';
import { AddFeedDialog, ConfirmDeleteDialog, FeedAvatar } from './FeedDialogs';
import { CountBadge, Popover } from './Popover';
import { YouTubeIcon } from './YouTubeIcon';

export type ManageSection = 'youtube' | 'rss' | 'topics';

interface ManageFeedsTabProps {
  initialSection: ManageSection;
  onChanged: () => void;
  onStatus: (status: { text: string; isError?: boolean } | null) => void;
}

function ColorSwatchGrid({
  selectedColor,
  effectivePreset,
  onSelect,
  autoLabel,
  customLabel,
  applyLabel,
}: {
  selectedColor: TopicColor;
  effectivePreset: number;
  onSelect: (color: TopicColor) => void;
  autoLabel: string;
  customLabel: string;
  applyLabel: string;
}) {
  const [customHex, setCustomHex] = useState(() =>
    typeof selectedColor === 'string' ? selectedColor : '#66d9ef',
  );
  const normalizedHex = normalizeHexColor(customHex);
  const isCustomActive = typeof selectedColor === 'string';

  function applyCustom() {
    if (normalizedHex) onSelect(normalizedHex);
  }

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-8 gap-2">
        {TOPIC_PALETTE.map((swatch, index) => {
          const isActive = !isCustomActive && effectivePreset === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Color ${index + 1}`}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110',
                swatch.dot,
                isActive && 'ring-2 ring-fg ring-offset-2 ring-offset-surface',
              )}
            >
              {isActive && <Check className="h-3.5 w-3.5 stroke-[3] text-canvas" />}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5 border-t border-line/60 pt-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{customLabel}</div>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-lg border bg-canvas p-1',
            isCustomActive ? 'border-accent/70' : 'border-line',
          )}
        >
          <input
            type="color"
            value={normalizedHex ?? '#66d9ef'}
            onChange={(e) => setCustomHex(e.target.value)}
            aria-label={customLabel}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <input
            type="text"
            value={customHex}
            maxLength={7}
            onChange={(e) => setCustomHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyCustom();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
              }
            }}
            placeholder="#66d9ef"
            aria-label={customLabel}
            className="h-7 min-w-0 flex-1 bg-transparent px-1 font-mono text-xs text-fg placeholder:text-muted/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={!normalizedHex}
            onClick={applyCustom}
            title={applyLabel}
            aria-label={applyLabel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-canvas transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors',
          selectedColor === null
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-line text-muted hover:bg-elevated hover:text-fg',
        )}
      >
        {autoLabel}
      </button>
    </div>
  );
}

export function ManageFeedsTab({ initialSection, onChanged, onStatus }: ManageFeedsTabProps) {
  const { t } = useI18n();
  const { topics, setTopics, reload: reloadTopics, colorOf } = useTopics();

  const [section, setSection] = useState<ManageSection>(initialSection);
  const [youtubeFeeds, setYoutubeFeeds] = useState<Feed[]>([]);
  const [rssFeeds, setRssFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedSearch, setFeedSearch] = useState('');

  // Feed actions
  const [addType, setAddType] = useState<FeedType | null>(null);
  const [deletingFeed, setDeletingFeed] = useState<Feed | null>(null);
  const [topicFilter, setTopicFilter] = useState('');
  const [savingFeedId, setSavingFeedId] = useState<number | null>(null);

  // Topic actions
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicColor, setNewTopicColor] = useState<TopicColor>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingTopic, setSavingTopic] = useState(false);
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null);

  useEffect(() => {
    setSection(initialSection);
    setFeedSearch('');
    setEditingTopic(null);
  }, [initialSection]);

  const loadFeeds = useCallback(async () => {
    try {
      const [yt, rss] = await Promise.all([api.getFeeds('youtube', false), api.getFeeds('rss', false)]);
      setYoutubeFeeds(yt);
      setRssFeeds(rss);
    } catch (err) {
      onStatus({ text: errorText(err, t), isError: true });
    } finally {
      setLoading(false);
    }
  }, [onStatus, t]);

  useEffect(() => {
    void loadFeeds();
  }, [loadFeeds]);

  const activeFeeds = section === 'youtube' ? youtubeFeeds : rssFeeds;
  const filteredFeeds = useMemo(() => {
    const q = feedSearch.trim().toLocaleLowerCase();
    if (!q) return activeFeeds;
    return activeFeeds.filter(
      (f) => f.title.toLocaleLowerCase().includes(q) || (f.category?.toLocaleLowerCase().includes(q) ?? false),
    );
  }, [activeFeeds, feedSearch]);

  async function handleAssignFeedTopic(feed: Feed, category: string | null) {
    setSavingFeedId(feed.id);
    try {
      const updated = await api.updateFeedCategory(feed.id, category);
      const setter = feed.type === 'youtube' ? setYoutubeFeeds : setRssFeeds;
      setter((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      await reloadTopics();
      onChanged();
    } catch (err) {
      onStatus({ text: errorText(err, t), isError: true });
    } finally {
      setSavingFeedId(null);
    }
  }

  async function handleCreateTopic(e: FormEvent) {
    e.preventDefault();
    const trimmed = newTopicName.trim();
    if (!trimmed || creatingTopic) return;
    setCreatingTopic(true);
    onStatus(null);
    try {
      const updated = await api.createTopic(trimmed, newTopicColor);
      setTopics(updated);
      setNewTopicName('');
      setNewTopicColor(null);
      onChanged();
    } catch (err) {
      onStatus({ text: errorText(err, t), isError: true });
    } finally {
      setCreatingTopic(false);
    }
  }

  async function handleTopicColor(topic: Topic, color: TopicColor) {
    try {
      const updated = await api.updateTopic(topic.name, { color });
      setTopics(updated);
      onChanged();
    } catch (err) {
      onStatus({ text: errorText(err, t), isError: true });
    }
  }

  async function handleRenameSubmit(topic: Topic) {
    const trimmed = renameValue.trim();
    if (!trimmed || savingTopic) return;
    if (trimmed === topic.name) {
      setEditingTopic(null);
      return;
    }
    setSavingTopic(true);
    onStatus(null);
    try {
      const updated = await api.updateTopic(topic.name, { newName: trimmed });
      setTopics(updated);
      setEditingTopic(null);
      await loadFeeds();
      onChanged();
    } catch (err) {
      onStatus({ text: errorText(err, t), isError: true });
    } finally {
      setSavingTopic(false);
    }
  }

  const subTabs: { id: ManageSection; label: string; count: number; icon: ComponentType<{ className?: string }> }[] = [
    { id: 'youtube', label: t('nav.youtube'), count: youtubeFeeds.length, icon: YouTubeIcon },
    { id: 'rss', label: t('nav.rss'), count: rssFeeds.length, icon: Rss },
    { id: 'topics', label: t('common.topics'), count: topics.length, icon: Tags },
  ];

  const trimmedTopicFilter = topicFilter.trim();
  const topicFilterMatches = topics.filter(
    (topic) => !trimmedTopicFilter || topic.name.toLocaleLowerCase().includes(trimmedTopicFilter.toLocaleLowerCase()),
  );
  const exactTopicExists =
    trimmedTopicFilter !== '' &&
    topics.some((topic) => topic.name.toLocaleLowerCase() === trimmedTopicFilter.toLocaleLowerCase());

  return (
    <div className="space-y-4 pb-12">
      {/* Segmented sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-canvas/60 p-1.5">
        {subTabs.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSection(item.id);
                setFeedSearch('');
                setEditingTopic(null);
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-elevated hover:text-fg',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  !active && item.id === 'youtube' && 'text-youtube',
                  !active && item.id === 'rss' && 'text-warning',
                )}
              />
              <span>{item.label}</span>
              <CountBadge value={item.count} highlight={active} />
            </button>
          );
        })}
      </div>

      {/* YOUTUBE / RSS FEEDS MANAGEMENT */}
      {(section === 'youtube' || section === 'rss') && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={feedSearch}
                onChange={(e) => setFeedSearch(e.target.value)}
                placeholder={t('settings.manage.searchPlaceholder')}
                className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setAddType(section)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-canvas transition-colors hover:bg-accent-strong"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>{t(`${section}.addButton`)}</span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              <span>{t('common.loading')}</span>
            </div>
          ) : activeFeeds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-canvas/40 px-4 py-8 text-center text-sm text-muted">
              {t(`${section}.noFeeds`)}
            </div>
          ) : filteredFeeds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-canvas/40 px-4 py-8 text-center text-sm text-muted">
              {t('common.noMatches')}
            </div>
          ) : (
            <div className="divide-y divide-line/60 rounded-xl border border-line bg-canvas/60">
              {filteredFeeds.map((feed, index) => {
                const openUp = filteredFeeds.length > 3 && index >= filteredFeeds.length - 2;
                const targetUrl = feed.sourceUrl ?? feed.siteUrl ?? feed.feedUrl;
                const topicColor = feed.category ? colorOf(feed.category) : null;
                return (
                  <div
                    key={feed.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 sm:flex-nowrap"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FeedAvatar feed={feed} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-sm font-medium text-fg transition-colors hover:text-accent hover:underline"
                          >
                            {feed.title}
                          </a>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted/70" />
                          {feed.lastError && (
                            <span
                              className="shrink-0 text-warning"
                              title={t('common.lastError', { error: feed.lastError })}
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted tabular-nums">
                          {t('settings.manage.feedStats', {
                            unread: feed.unreadCount,
                            total: feed.totalCount,
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {/* Inline Topic Selector */}
                      <Popover
                        align="right"
                        direction={openUp ? 'up' : 'down'}
                        panelClassName="w-60"
                        trigger={({ open, toggle }) => (
                          <button
                            type="button"
                            disabled={savingFeedId === feed.id}
                            onClick={() => {
                              if (!open) setTopicFilter('');
                              toggle();
                            }}
                            aria-expanded={open}
                            className={cn(
                              'flex h-8 max-w-[11rem] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors',
                              topicColor
                                ? topicColor.badge
                                : 'border-dashed border-line text-muted hover:border-muted/60 hover:text-fg',
                            )}
                            style={topicColor?.badgeStyle}
                          >
                            {topicColor ? (
                              <span
                                className={cn('h-2 w-2 shrink-0 rounded-full', topicColor.dot)}
                                style={topicColor.dotStyle}
                              />
                            ) : (
                              <Plus className="h-3 w-3 shrink-0" />
                            )}
                            <span className="truncate">
                              {feed.category ?? t('settings.manage.assignTopic')}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-75" />
                          </button>
                        )}
                      >
                        {(close) => (
                          <div className="flex max-h-72 flex-col">
                            <div className="border-b border-line p-2">
                              <input
                                type="text"
                                autoFocus
                                value={topicFilter}
                                onChange={(e) => setTopicFilter(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && trimmedTopicFilter) {
                                    e.preventDefault();
                                    void handleAssignFeedTopic(feed, trimmedTopicFilter);
                                    close();
                                  }
                                }}
                                placeholder={t('settings.manage.topicFilterPlaceholder')}
                                className="h-8 w-full rounded-lg border border-line bg-canvas px-2.5 text-xs placeholder:text-muted/70 focus:border-accent focus:outline-none"
                              />
                            </div>
                            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                              {!trimmedTopicFilter && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleAssignFeedTopic(feed, null);
                                    close();
                                  }}
                                  className={cn(
                                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                                    feed.category === null
                                      ? 'bg-accent/15 text-accent'
                                      : 'text-muted hover:bg-elevated hover:text-fg',
                                  )}
                                >
                                  <span className="flex-1 truncate">{t('common.noTopic')}</span>
                                  {feed.category === null && <Check className="h-3.5 w-3.5 shrink-0" />}
                                </button>
                              )}

                              {topicFilterMatches.map((topic) => {
                                const active = feed.category?.toLocaleLowerCase() === topic.name.toLocaleLowerCase();
                                return (
                                  <button
                                    key={topic.name}
                                    type="button"
                                    onClick={() => {
                                      void handleAssignFeedTopic(feed, topic.name);
                                      close();
                                    }}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                                      active ? 'bg-accent/15 text-accent' : 'text-fg hover:bg-elevated',
                                    )}
                                  >
                                    <span
                                      className={cn('h-2 w-2 shrink-0 rounded-full', colorOf(topic.name).dot)}
                                      style={colorOf(topic.name).dotStyle}
                                    />
                                    <span className="flex-1 truncate">{topic.name}</span>
                                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                                  </button>
                                );
                              })}

                              {trimmedTopicFilter && !exactTopicExists && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleAssignFeedTopic(feed, trimmedTopicFilter);
                                    close();
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
                                >
                                  <Plus className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {t('settings.manage.createTopicOption', { name: trimmedTopicFilter })}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </Popover>

                      <button
                        type="button"
                        onClick={() => setDeletingFeed(feed)}
                        title={t('common.remove')}
                        aria-label={t('common.remove')}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TOPICS MANAGEMENT */}
      {section === 'topics' && (
        <div className="space-y-3">
          {/* Create new topic form */}
          <form onSubmit={handleCreateTopic} className="flex flex-wrap items-center gap-2">
            <Popover
              align="left"
              panelClassName="w-68"
              trigger={({ open, toggle }) => {
                const previewColor =
                  newTopicColor !== null
                    ? getTopicColor(newTopicName || ' ', newTopicColor)
                    : newTopicName.trim()
                      ? getTopicColor(newTopicName)
                      : null;
                return (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    title={t('settings.manage.pickColor')}
                    aria-label={t('settings.manage.pickColor')}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 transition-colors hover:border-muted/60"
                  >
                    <span
                      className={cn('h-3.5 w-3.5 rounded-full', previewColor ? previewColor.dot : 'bg-muted/60')}
                      style={previewColor?.dotStyle}
                    />
                    <ChevronDown className="h-3.5 w-3.5 text-muted" />
                  </button>
                );
              }}
            >
              {(close) => (
                <ColorSwatchGrid
                  selectedColor={newTopicColor}
                  effectivePreset={
                    typeof newTopicColor === 'number'
                      ? newTopicColor
                      : newTopicColor === null && newTopicName.trim()
                        ? autoTopicColorIndex(newTopicName)
                        : -1
                  }
                  onSelect={(c) => {
                    setNewTopicColor(c);
                    close();
                  }}
                  autoLabel={t('settings.manage.autoColor')}
                  customLabel={t('settings.manage.customColor')}
                  applyLabel={t('settings.manage.applyColor')}
                />
              )}
            </Popover>

            <input
              type="text"
              maxLength={40}
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              placeholder={t('settings.manage.newTopicPlaceholder')}
              className="h-9 min-w-[12rem] flex-1 rounded-lg border border-line bg-canvas px-3 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={creatingTopic || !newTopicName.trim()}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-canvas transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingTopic ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 stroke-[2.5]" />}
              <span>{t('settings.manage.addTopic')}</span>
            </button>
          </form>

          {topics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-canvas/40 px-4 py-8 text-center text-sm text-muted">
              {t('settings.manage.noTopics')}
            </div>
          ) : (
            <div className="divide-y divide-line/60 rounded-xl border border-line bg-canvas/60">
              {topics.map((topic, index) => {
                const openUp = topics.length > 3 && index >= topics.length - 2;
                const isEditing = editingTopic === topic.name;
                const color = colorOf(topic.name);
                const effectivePreset =
                  typeof topic.color === 'number'
                    ? topic.color
                    : topic.color === null
                      ? autoTopicColorIndex(topic.name)
                      : -1;
                const totalFeeds = topic.youtubeCount + topic.rssCount;

                return (
                  <div key={topic.name} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {/* Color Swatch Picker */}
                      <Popover
                        align="left"
                        direction={openUp ? 'up' : 'down'}
                        panelClassName="w-68"
                        trigger={({ open, toggle }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            aria-expanded={open}
                            title={t('settings.manage.pickColor')}
                            aria-label={t('settings.manage.pickColor')}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface transition-colors hover:border-muted/60"
                          >
                            <span className={cn('h-3.5 w-3.5 rounded-full', color.dot)} style={color.dotStyle} />
                          </button>
                        )}
                      >
                        {(close) => (
                          <ColorSwatchGrid
                            selectedColor={topic.color}
                            effectivePreset={effectivePreset}
                            onSelect={(nextColor) => {
                              void handleTopicColor(topic, nextColor);
                              close();
                            }}
                            autoLabel={t('settings.manage.autoColor')}
                            customLabel={t('settings.manage.customColor')}
                            applyLabel={t('settings.manage.applyColor')}
                          />
                        )}
                      </Popover>

                      {isEditing ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            maxLength={40}
                            disabled={savingTopic}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleRenameSubmit(topic);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingTopic(null);
                              }
                            }}
                            className="h-8 min-w-0 flex-1 rounded-lg border border-accent bg-surface px-2.5 text-sm focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={savingTopic || !renameValue.trim()}
                            onClick={() => void handleRenameSubmit(topic)}
                            title={t('common.save')}
                            aria-label={t('common.save')}
                            className="rounded-lg bg-success/15 p-1.5 text-success transition-colors hover:bg-success/25 disabled:opacity-50"
                          >
                            {savingTopic ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            disabled={savingTopic}
                            onClick={() => setEditingTopic(null)}
                            title={t('common.cancel')}
                            aria-label={t('common.cancel')}
                            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-fg"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <span
                            className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', color.badge)}
                            style={color.badgeStyle}
                          >
                            {topic.name}
                          </span>
                          <span className="text-xs text-muted tabular-nums">
                            {totalFeeds === 0
                              ? t('settings.manage.noTopicFeeds')
                              : [
                                  topic.youtubeCount > 0 ? `${topic.youtubeCount} ${t('nav.youtube')}` : null,
                                  topic.rssCount > 0 ? `${topic.rssCount} ${t('nav.rss')}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTopic(topic.name);
                            setRenameValue(topic.name);
                          }}
                          title={t('settings.manage.rename')}
                          aria-label={t('settings.manage.rename')}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-fg"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTopic(topic)}
                          title={t('common.remove')}
                          aria-label={t('common.remove')}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {addType && (
        <AddFeedDialog
          type={addType}
          onClose={() => setAddType(null)}
          onSubmit={async (url, category) => {
            try {
              const res = await api.addFeed(addType, url, category);
              await loadFeeds();
              await reloadTopics();
              onChanged();
              return t(`${addType}.added`, { title: res.feed.title, count: res.added });
            } catch (err) {
              throw new Error(errorText(err, t));
            }
          }}
          onAdded={(text) => onStatus({ text })}
        />
      )}

      {deletingFeed && (
        <ConfirmDeleteDialog
          title={t(`${deletingFeed.type}.deleteTitle`)}
          message={t(`${deletingFeed.type}.confirmDelete`, { title: deletingFeed.title })}
          confirmLabel={t('common.deleteConfirmButton')}
          onClose={() => setDeletingFeed(null)}
          onConfirm={async () => {
            try {
              await api.deleteFeed(deletingFeed.id);
              await loadFeeds();
              await reloadTopics();
              onChanged();
            } catch (err) {
              onStatus({ text: errorText(err, t), isError: true });
            }
          }}
        />
      )}

      {deletingTopic && (
        <ConfirmDeleteDialog
          title={t('settings.manage.deleteTopicTitle')}
          message={t('settings.manage.confirmDeleteTopic', { name: deletingTopic.name })}
          confirmLabel={t('common.deleteConfirmButton')}
          onClose={() => setDeletingTopic(null)}
          onConfirm={async () => {
            try {
              const updated = await api.deleteTopic(deletingTopic.name);
              setTopics(updated);
              await loadFeeds();
              onChanged();
            } catch (err) {
              onStatus({ text: errorText(err, t), isError: true });
            }
          }}
        />
      )}
    </div>
  );
}
