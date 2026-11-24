import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  LoaderCircle,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { TwitchStream, TwitchStreamsResponse } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { cn, errorText, formatNumber, formatRelative } from '../utils/format';
import { useLocalStorage } from '../utils/useLocalStorage';
import { TwitchIcon } from '../components/TwitchIcon';
import { ConfirmDeleteDialog } from '../components/FeedDialogs';

interface TwitchPageProps {
  /** Incremented when the server finishes a background Twitch sync or restores a backup. */
  refreshKey: number;
}

function formatUptime(startedAt: string | null, referenceTs: number | null): string | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  const now = referenceTs ?? Date.now();
  const diffMin = Math.max(0, Math.floor((now - started) / 60_000));
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ChannelAvatar({ channel, dimmed = false }: { channel: TwitchStream; dimmed?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initial = (channel.displayName || channel.login).slice(0, 1).toUpperCase();

  if (channel.avatarUrl && !failed) {
    return (
      <img
        src={channel.avatarUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(
          'h-9 w-9 shrink-0 rounded-full border border-line object-cover',
          dimmed && 'opacity-70 grayscale',
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm font-semibold text-muted',
        dimmed && 'opacity-70',
      )}
    >
      {initial}
    </span>
  );
}

function AddTwitchDialog({
  onClose,
  onSubmit,
  onAdded,
}: {
  onClose: () => void;
  onSubmit: (channel: string) => Promise<TwitchStream>;
  onAdded: (name: string) => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const added = await onSubmit(input.trim());
      onAdded(added.displayName);
      onClose();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-twitch-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <TwitchIcon className="h-5 w-5 text-accent" />
            <h2 id="add-twitch-title" className="text-base font-semibold">
              {t('twitch.addTitle')}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-elevated hover:text-fg"
            aria-label={t('common.dismiss')}
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <p className="mt-2 text-xs text-muted">{t('twitch.addHint')}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="text"
            autoFocus
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('twitch.addPlaceholder')}
            className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-line bg-canvas px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-canvas transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
              <span>{t('twitch.addButton')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TwitchPage({ refreshKey }: TwitchPageProps) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<TwitchStreamsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useLocalStorage('tallydeck.twitch.onlineOnly', false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<TwitchStream | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2_000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await api.getTwitchStreams();
      if (id !== requestId.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (id === requestId.current) setError(errorText(err, t));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [t]);

  // Reload on mount and whenever the server's configured Twitch sync interval (default 15 min) completes.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleManualSync = useCallback(async () => {
    setSyncing(true);
    try {
      const next = await api.syncTwitch();
      setData(next);
      setError(null);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setSyncing(false);
    }
  }, [t]);

  const handleAddChannel = useCallback(
    async (channel: string) => {
      const added = await api.addTwitchChannel(channel);
      await load();
      return added;
    },
    [load],
  );

  const confirmDeleteChannel = useCallback(async () => {
    if (!channelToDelete) return;
    const target = channelToDelete;
    try {
      await api.deleteTwitchChannel(target.id);
      setData((prev) => (prev ? { ...prev, channels: prev.channels.filter((c) => c.id !== target.id) } : prev));
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [channelToDelete, t]);

  const channels = data?.channels ?? [];
  const totalCount = channels.length;
  const totalLive = useMemo(() => channels.filter((c) => c.isLive).length, [channels]);

  const query = search.trim().toLowerCase();
  const { onlineChannels, offlineChannels } = useMemo(() => {
    const matches = (c: TwitchStream) =>
      !query ||
      c.displayName.toLowerCase().includes(query) ||
      c.login.toLowerCase().includes(query) ||
      (c.title?.toLowerCase().includes(query) ?? false) ||
      (c.gameName?.toLowerCase().includes(query) ?? false);

    const filtered = channels.filter(matches);
    return {
      onlineChannels: filtered.filter((c) => c.isLive),
      offlineChannels: filtered.filter((c) => !c.isLive),
    };
  }, [channels, query]);

  // Cache-buster only changes when Twitch was actually synced (e.g. every 15 min) to avoid unnecessary traffic.
  const thumbBust = data?.lastSyncedAt ?? 0;
  const lastSyncLabel = data?.lastSyncedAt
    ? t('nav.lastSync', { time: formatRelative(data.lastSyncedAt, locale) })
    : t('nav.neverSynced');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-4 p-4 md:p-5">
        {/* Toolbar */}
        <section className="shrink-0 rounded-xl border border-line bg-surface p-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search bar */}
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('twitch.searchPlaceholder')}
                className="h-10 w-full rounded-lg border border-line bg-canvas pl-10 pr-9 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-elevated hover:text-fg"
                  aria-label={t('common.clearSearch')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Toggle: All channels vs Online only */}
            <button
              type="button"
              onClick={() => setOnlineOnly((v) => !v)}
              aria-pressed={onlineOnly}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
                onlineOnly
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-canvas text-fg hover:border-muted/60',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  totalLive > 0 ? 'bg-red-500' : 'bg-muted/50',
                )}
                aria-hidden="true"
              />
              <span>{onlineOnly ? t('twitch.onlyOnline') : t('twitch.allChannels')}</span>
              <span className="rounded-md bg-elevated px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted">
                {totalLive}/{totalCount}
              </span>
            </button>

            {/* Manual refresh button */}
            <button
              type="button"
              onClick={() => void handleManualSync()}
              disabled={syncing}
              title={`${t('twitch.refresh')} · ${lastSyncLabel}`}
              aria-label={t('twitch.refresh')}
              className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm font-medium text-muted transition-colors hover:border-muted/60 hover:text-fg disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin text-accent')} />
              <span className="hidden md:inline text-xs">{lastSyncLabel}</span>
            </button>

            {/* Add channel */}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              title={t('twitch.addTitle')}
              className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-canvas transition-colors hover:bg-accent-strong"
            >
              <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
              <span className="hidden sm:inline">{t('twitch.addButton')}</span>
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
        </section>

        {/* Error banner */}
        {(error || data?.lastError) && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error ?? t('common.lastError', { error: data?.lastError ?? '' })}</span>
            <button
              type="button"
              onClick={() => void handleManualSync()}
              className="rounded px-2 py-0.5 hover:bg-danger/20"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
            <span>{t('common.loading')}</span>
          </div>
        ) : totalCount === 0 ? (
          /* Empty state: no channels yet */
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <TwitchIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold">{t('twitch.noChannelsTitle')}</h2>
            <p className="mt-1 max-w-md text-sm text-muted">{t('twitch.noChannelsHint')}</p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-canvas transition-colors hover:bg-accent-strong"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>{t('twitch.addButton')}</span>
            </button>
          </div>
        ) : onlineChannels.length === 0 && (onlineOnly || offlineChannels.length === 0) ? (
          /* Empty state: search has no results OR nobody is online */
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface/50 px-6 py-14 text-center">
            <Radio className="h-8 w-8 text-muted/60" />
            <h2 className="mt-3 text-base font-semibold">
              {query ? t('common.noMatches') : t('twitch.noneOnlineTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {query ? t('common.noResults') : t('twitch.noneOnlineHint', { total: totalCount })}
            </p>
            {!query && onlineOnly && (
              <button
                type="button"
                onClick={() => setOnlineOnly(false)}
                className="mt-4 rounded-lg border border-line bg-canvas px-3.5 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
              >
                {t('twitch.showAllButton')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Live streams tile grid */}
            {onlineChannels.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                    <span>{t('twitch.liveCount', { live: onlineChannels.length, total: totalCount })}</span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {onlineChannels.map((ch) => {
                    const uptime = formatUptime(ch.startedAt, data?.lastSyncedAt ?? null);
                    const thumbSrc = ch.thumbnailUrl
                      ? `${ch.thumbnailUrl}${ch.thumbnailUrl.includes('?') ? '&' : '?'}t=${thumbBust}`
                      : null;

                    return (
                      <div key={ch.id} className="group relative">
                        <a
                          href={ch.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-all hover:border-accent/70 hover:shadow-lg"
                        >
                          {/* 16:9 Live Preview */}
                          <div className="relative aspect-video w-full overflow-hidden bg-canvas">
                            {thumbSrc ? (
                              <img
                                src={thumbSrc}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted/40">
                                <TwitchIcon className="h-10 w-10" />
                              </div>
                            )}

                            {/* LIVE badge */}
                            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white shadow-sm">
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
                              {t('twitch.liveBadge')}
                            </span>

                            {/* Viewer count */}
                            {ch.viewerCount !== null && (
                              <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-xs font-semibold tabular-nums text-white backdrop-blur-xs">
                                <Users className="h-3.5 w-3.5 text-red-400" />
                                {formatNumber(ch.viewerCount, locale)}
                              </span>
                            )}

                            {/* Uptime */}
                            {uptime && (
                              <span className="absolute bottom-2 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-xs font-medium tabular-nums text-white backdrop-blur-xs">
                                <Clock className="h-3 w-3 opacity-80" />
                                {uptime}
                              </span>
                            )}
                          </div>

                          {/* Channel details */}
                          <div className="flex flex-1 items-start gap-3 p-3">
                            <ChannelAvatar channel={ch} />
                            <div className="min-w-0 flex-1">
                              <h3
                                className="line-clamp-2 text-sm font-semibold leading-snug text-fg transition-colors group-hover:text-accent"
                                title={ch.title ?? ch.displayName}
                              >
                                {ch.title || ch.displayName}
                              </h3>
                              <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted">
                                <span className="truncate">{ch.displayName}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                              </div>
                              {ch.gameName && (
                                <p className="mt-0.5 truncate text-xs text-muted/80" title={ch.gameName}>
                                  {ch.gameName}
                                </p>
                              )}
                            </div>
                          </div>
                        </a>

                        {/* Remove channel button */}
                        <button
                          type="button"
                          onClick={() => setChannelToDelete(ch)}
                          title={t('twitch.removeChannel')}
                          aria-label={t('twitch.removeChannel')}
                          className="absolute right-2.5 top-2.5 rounded-lg bg-black/70 p-1.5 text-white/80 opacity-0 backdrop-blur-xs transition-all hover:bg-danger hover:text-white focus:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Offline channels (only when showing all channels) */}
            {!onlineOnly && offlineChannels.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t('twitch.offlineSection', { count: offlineChannels.length })}
                </h2>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {offlineChannels.map((ch) => (
                    <div
                      key={ch.id}
                      className="group relative flex items-center rounded-xl border border-line bg-surface/70 transition-colors hover:border-muted/60 hover:bg-surface"
                    >
                      <a
                        href={ch.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-3 p-3 pr-10"
                      >
                        <ChannelAvatar channel={ch} dimmed />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-fg/85 group-hover:text-accent">
                            {ch.displayName}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted/50" aria-hidden="true" />
                            <span>{t('twitch.offlineBadge')}</span>
                          </div>
                        </div>
                      </a>
                      <button
                        type="button"
                        onClick={() => setChannelToDelete(ch)}
                        title={t('twitch.removeChannel')}
                        aria-label={t('twitch.removeChannel')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted opacity-0 transition-all hover:bg-danger/15 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {addOpen && (
          <AddTwitchDialog
            onClose={() => setAddOpen(false)}
            onSubmit={handleAddChannel}
            onAdded={(name) => setToast(t('twitch.added', { name }))}
          />
        )}

        {channelToDelete && (
          <ConfirmDeleteDialog
            title={t('twitch.deleteTitle')}
            message={t('twitch.confirmDelete', { name: channelToDelete.displayName })}
            confirmLabel={t('common.deleteConfirmButton')}
            onClose={() => setChannelToDelete(null)}
            onConfirm={confirmDeleteChannel}
          />
        )}
      </div>
    </div>
  );
}
