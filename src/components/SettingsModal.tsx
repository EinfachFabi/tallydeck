import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Download,
  Info,
  LayoutList,
  LoaderCircle,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Rows3,
  Rss,
  SlidersHorizontal,
  Sun,
  Tags,
  Upload,
  X,
} from 'lucide-react';
import type {
  FeedType,
  FullBackupPayload,
  PollIntervalMinutes,
  ServerSettings,
  TwitchPollIntervalMinutes,
  VersionInfo,
} from '../types';
import { api } from '../api';
import { useI18n } from '../i18n/I18nContext';
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_COMPLETED_DAYS,
  DEFAULT_INBOX_LIMIT,
  DEFAULT_THEME,
  DEFAULT_VIEW_DENSITY,
  MAX_COMPLETED_DAYS,
  MAX_INBOX_LIMIT,
  MIN_COMPLETED_DAYS,
  MIN_INBOX_LIMIT,
  THEMES,
  useSettings,
  type ColorMode,
  type ThemeId,
  type ViewDensity,
} from '../context/SettingsContext';
import { cn, errorText } from '../utils/format';
import { InfoTab } from './InfoTab';
import { ManageFeedsTab } from './ManageFeedsTab';
import { YouTubeIcon } from './YouTubeIcon';
import { TwitchIcon } from './TwitchIcon';

export type SettingsTab = 'appearance' | 'manage' | 'feeds' | 'sync' | 'backup' | 'info';

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTab;
  activeFeedType?: FeedType;
  versionInfo: VersionInfo | null;
  onVersionChange: (info: VersionInfo) => void;
  onClose: () => void;
  onImported: () => void;
}

const INBOX_PRESETS = [25, 50, 100, 200, 500] as const;
const DAYS_PRESETS = [1, 3, 7, 14, 30] as const;
const POLL_OPTIONS: readonly PollIntervalMinutes[] = [0, 5, 15, 30, 60];
const TWITCH_POLL_OPTIONS: readonly TwitchPollIntervalMinutes[] = [15, 30, 60, 120];
const AUTO_ARCHIVE_PRESETS = [7, 14, 30, 60, 90] as const;

export function SettingsModal({
  open,
  initialTab = 'appearance',
  activeFeedType = 'youtube',
  versionInfo,
  onVersionChange,
  onClose,
  onImported,
}: SettingsModalProps) {
  const { t } = useI18n();
  const {
    colorMode,
    setColorMode,
    theme,
    setTheme,
    viewDensity,
    setViewDensity,
    inboxLimit,
    setInboxLimit,
    completedDays,
    setCompletedDays,
  } = useSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Server settings state (poll interval + twitch poll interval + auto-archive unread items)
  const [serverSettings, setServerSettings] = useState<ServerSettings>({
    pollIntervalMinutes: 15,
    twitchPollIntervalMinutes: 15,
    autoArchiveEnabled: false,
    autoArchiveDays: 30,
  });
  const [savingServer, setSavingServer] = useState(false);

  // OPML + Twitch + Backup status messages
  const [importingType, setImportingType] = useState<FeedType | 'twitch' | null>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'restore' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const ytFileRef = useRef<HTMLInputElement | null>(null);
  const rssFileRef = useRef<HTMLInputElement | null>(null);
  const twitchFileRef = useRef<HTMLInputElement | null>(null);
  const backupFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setStatusMessage(null);
    api
      .getSettings()
      .then((s) => setServerSettings(s))
      .catch(() => {
        /* ignore if offline */
      });
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !importingType && !backupBusy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, importingType, backupBusy, onClose]);

  if (!open) return null;

  const isBusy = Boolean(importingType || backupBusy || savingServer);

  async function patchServerSettings(patch: Partial<ServerSettings>) {
    const optimistic = { ...serverSettings, ...patch };
    setServerSettings(optimistic);
    setSavingServer(true);
    try {
      const res = await api.updateSettings(patch);
      setServerSettings(res.settings);
      if (res.archived > 0) {
        setStatusMessage({
          text: t('settings.autoArchiveSaved', { count: res.archived }),
        });
      }
      onImported();
    } catch (err) {
      setStatusMessage({ text: errorText(err, t), isError: true });
    } finally {
      setSavingServer(false);
    }
  }

  async function handleOpmlSelect(feedType: FeedType, file: File | undefined) {
    if (!file || isBusy) return;
    setImportingType(feedType);
    setStatusMessage(null);
    try {
      const text = await file.text();
      const result = await api.importOpml(feedType, text);
      setStatusMessage({
        text: t('settings.importResult', {
          imported: result.imported,
          skipped: result.skipped,
          failed: result.failed,
        }),
      });
      onImported();
    } catch (err) {
      setStatusMessage({
        text: errorText(err, t),
        isError: true,
      });
    } finally {
      setImportingType(null);
      if (ytFileRef.current) ytFileRef.current.value = '';
      if (rssFileRef.current) rssFileRef.current.value = '';
    }
  }

  async function handleTwitchImport(file: File | undefined) {
    if (!file || isBusy) return;
    setImportingType('twitch');
    setStatusMessage(null);
    try {
      const text = await file.text();
      const result = await api.importTwitchChannels(text);
      setStatusMessage({
        text: t('settings.importResult', {
          imported: result.imported,
          skipped: result.skipped,
          failed: result.failed,
        }),
      });
      onImported();
    } catch (err) {
      setStatusMessage({
        text: errorText(err, t),
        isError: true,
      });
    } finally {
      setImportingType(null);
      if (twitchFileRef.current) twitchFileRef.current.value = '';
    }
  }

  async function handleExportFullBackup() {
    if (isBusy) return;
    setBackupBusy('export');
    setStatusMessage(null);
    try {
      const payload = await api.exportBackup();
      payload.clientSettings = {
        colorMode,
        theme,
        viewDensity,
        inboxLimit,
        completedDays,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tallydeck-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatusMessage({ text: errorText(err, t), isError: true });
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleRestoreFullBackup(file: File | undefined) {
    if (!file || isBusy) return;
    setBackupBusy('restore');
    setStatusMessage(null);
    try {
      const raw = await file.text();
      let payload: FullBackupPayload;
      try {
        payload = JSON.parse(raw) as FullBackupPayload;
      } catch {
        throw new Error(t('errors.invalid_backup'));
      }
      const res = await api.restoreBackup(payload);
      setServerSettings(res.serverSettings);

      if (payload.clientSettings && typeof payload.clientSettings === 'object') {
        const cs = payload.clientSettings;
        if (cs.colorMode === 'dark' || cs.colorMode === 'light') setColorMode(cs.colorMode as ColorMode);
        if (typeof cs.theme === 'string' && THEMES.some((th) => th.id === cs.theme)) setTheme(cs.theme as ThemeId);
        if (cs.viewDensity === 'comfortable' || cs.viewDensity === 'compact') {
          setViewDensity(cs.viewDensity as ViewDensity);
        }
        if (typeof cs.inboxLimit === 'number') setInboxLimit(cs.inboxLimit);
        if (typeof cs.completedDays === 'number') setCompletedDays(cs.completedDays);
      }

      setStatusMessage({
        text: t('settings.backupRestored', {
          feeds: res.feedsRestored,
          items: res.itemsRestored,
        }),
      });
      onImported();
    } catch (err) {
      setStatusMessage({ text: errorText(err, t), isError: true });
    } finally {
      setBackupBusy(null);
      if (backupFileRef.current) backupFileRef.current.value = '';
    }
  }

  function resetToDefaults() {
    setColorMode(DEFAULT_COLOR_MODE);
    setTheme(DEFAULT_THEME);
    setViewDensity(DEFAULT_VIEW_DENSITY);
    setInboxLimit(DEFAULT_INBOX_LIMIT);
    setCompletedDays(DEFAULT_COMPLETED_DAYS);
    void patchServerSettings({
      pollIntervalMinutes: 15,
      autoArchiveEnabled: false,
      autoArchiveDays: 30,
    });
  }

  const tabs: { id: SettingsTab; label: string; icon: typeof Palette; badge?: boolean }[] = [
    { id: 'appearance', label: t('settings.tabs.appearance'), icon: Palette },
    { id: 'manage', label: t('settings.tabs.manage'), icon: Tags },
    { id: 'feeds', label: t('settings.tabs.feeds'), icon: SlidersHorizontal },
    { id: 'sync', label: t('settings.tabs.sync'), icon: RefreshCw },
    { id: 'backup', label: t('settings.tabs.backup'), icon: Database },
    {
      id: 'info',
      label: t('settings.tabs.info'),
      icon: Info,
      badge: Boolean(versionInfo?.updateAvailable),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
      onClick={() => !isBusy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="flex h-[48rem] max-h-[92vh] w-full max-w-5xl animate-fade-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id="settings-modal-title" className="text-lg font-semibold">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="rounded-lg bg-danger p-1.5 text-white transition-colors hover:bg-danger/80 disabled:opacity-50"
            aria-label={t('settings.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body with left category navigation and right content pane */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Category Menu */}
          <nav
            aria-label={t('settings.title')}
            className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-sidebar/60 p-3 sm:w-56 sm:flex-col sm:border-b-0 sm:border-r"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setStatusMessage(null);
                  }}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors sm:text-sm',
                    active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-elevated hover:text-fg',
                  )}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.badge && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />}
                </button>
              );
            })}
          </nav>

          {/* Active Tab Content */}
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {statusMessage && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium',
                  statusMessage.isError ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success',
                )}
              >
                {statusMessage.isError ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1">{statusMessage.text}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  className="rounded p-0.5 opacity-75 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* TAB 1: APPEARANCE */}
            {activeTab === 'appearance' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t('settings.appearanceTitle')}
                </h3>

                {/* Dark Mode / Light Mode Switch */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div>
                    <div className="text-sm font-semibold">{t('settings.modeLabel')}</div>
                    <div className="text-xs text-muted">{t('settings.modeHint')}</div>
                  </div>
                  <div className="flex rounded-xl border border-line bg-surface p-1">
                    <button
                      type="button"
                      onClick={() => setColorMode('dark')}
                      aria-pressed={colorMode === 'dark'}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors',
                        colorMode === 'dark' ? 'bg-accent text-canvas' : 'text-muted hover:text-fg',
                      )}
                    >
                      <Moon className="h-4 w-4" />
                      <span>{t('settings.darkMode')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorMode('light')}
                      aria-pressed={colorMode === 'light'}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors',
                        colorMode === 'light' ? 'bg-accent text-canvas' : 'text-muted hover:text-fg',
                      )}
                    >
                      <Sun className="h-4 w-4" />
                      <span>{t('settings.lightMode')}</span>
                    </button>
                  </div>
                </div>

                {/* 5 Themes */}
                <div className="rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="mb-1 text-sm font-semibold">{t('settings.themeLabel')}</div>
                  <div className="mb-3 text-xs text-muted">{t('settings.themeHint')}</div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {THEMES.map((item) => {
                      const active = theme === item.id;
                      const swatch = item.preview[colorMode];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTheme(item.id)}
                          aria-pressed={active}
                          className={cn(
                            'flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-semibold transition-all',
                            active
                              ? 'border-accent bg-accent/15 text-accent shadow-xs'
                              : 'border-line bg-surface text-fg hover:border-muted/60',
                          )}
                        >
                          <span
                            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 px-2"
                            style={{ backgroundColor: swatch.bg }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: swatch.accent }} />
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: swatch.success }} />
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: swatch.danger }} />
                          </span>
                          <span className="truncate">{t(item.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* View Density: Comfortable vs Compact */}
                <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div>
                    <div className="text-sm font-semibold">{t('settings.densityLabel')}</div>
                    <div className="text-xs text-muted">{t('settings.densityHint')}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setViewDensity('comfortable')}
                      aria-pressed={viewDensity === 'comfortable'}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors',
                        viewDensity === 'comfortable'
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-line bg-surface text-muted hover:border-muted/60 hover:text-fg',
                      )}
                    >
                      <LayoutList className="h-4 w-4 shrink-0" />
                      <span>{t('settings.densityComfortable')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewDensity('compact')}
                      aria-pressed={viewDensity === 'compact'}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors',
                        viewDensity === 'compact'
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-line bg-surface text-muted hover:border-muted/60 hover:text-fg',
                      )}
                    >
                      <Rows3 className="h-4 w-4 shrink-0" />
                      <span>{t('settings.densityCompact')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: MANAGE FEEDS & TOPICS */}
            {activeTab === 'manage' && (
              <ManageFeedsTab
                initialSection={activeFeedType}
                onChanged={onImported}
                onStatus={setStatusMessage}
              />
            )}

            {/* TAB 3: FEEDS & INBOX LIMITS */}
            {activeTab === 'feeds' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t('settings.displayTitle')}
                </h3>

                {/* Inbox display limit (100 default) */}
                <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="settings-inbox-limit" className="block text-sm font-semibold">
                        {t('settings.inboxLimitLabel')}
                      </label>
                      <p className="text-xs text-muted">{t('settings.inboxLimitHint')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="settings-inbox-limit"
                        type="number"
                        min={MIN_INBOX_LIMIT}
                        max={MAX_INBOX_LIMIT}
                        step={10}
                        value={inboxLimit}
                        onChange={(e) => setInboxLimit(Number(e.target.value))}
                        className="w-22 rounded-lg border border-line bg-surface px-3 py-1.5 text-right text-sm font-semibold tabular-nums focus:border-accent focus:outline-none"
                      />
                      <span className="text-xs font-medium text-muted">{t('settings.inboxLimitUnit')}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {INBOX_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setInboxLimit(preset)}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors',
                          inboxLimit === preset
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-line bg-surface text-muted hover:border-muted/60 hover:text-fg',
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Completed items retention in Watched/Read column (7 days default, max 30 days) */}
                <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="settings-completed-days" className="block text-sm font-semibold">
                        {t('settings.completedDaysLabel')}
                      </label>
                      <p className="text-xs text-muted">{t('settings.completedDaysHint')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="settings-completed-days"
                        type="number"
                        min={MIN_COMPLETED_DAYS}
                        max={MAX_COMPLETED_DAYS}
                        step={1}
                        value={completedDays}
                        onChange={(e) => setCompletedDays(Number(e.target.value))}
                        className="w-20 rounded-lg border border-line bg-surface px-3 py-1.5 text-right text-sm font-semibold tabular-nums focus:border-accent focus:outline-none"
                      />
                      <span className="text-xs font-medium text-muted">{t('settings.completedDaysUnit')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={MIN_COMPLETED_DAYS}
                      max={MAX_COMPLETED_DAYS}
                      value={completedDays}
                      onChange={(e) => setCompletedDays(Number(e.target.value))}
                      aria-label={t('settings.completedDaysLabel')}
                      className="h-2 flex-1 cursor-pointer accent-accent"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCompletedDays(preset)}
                          className={cn(
                            'rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors',
                            completedDays === preset
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-line bg-surface text-muted hover:border-muted/60 hover:text-fg',
                          )}
                        >
                          {preset}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: BACKGROUND SYNC & AUTO-CLEANUP */}
            {activeTab === 'sync' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t('settings.syncTitle')}
                </h3>

                {/* Background Sync Interval Dropdown */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="settings-poll-interval" className="block text-sm font-semibold">
                      {t('settings.pollIntervalLabel')}
                    </label>
                    <p className="text-xs text-muted">{t('settings.pollIntervalHint')}</p>
                  </div>
                  <select
                    id="settings-poll-interval"
                    value={serverSettings.pollIntervalMinutes}
                    disabled={savingServer}
                    onChange={(e) =>
                      void patchServerSettings({
                        pollIntervalMinutes: Number(e.target.value) as PollIntervalMinutes,
                      })
                    }
                    className="w-48 shrink-0 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-fg focus:border-accent focus:outline-none"
                  >
                    {POLL_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? t('settings.pollOff') : t('settings.pollMinutes', { minutes })}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Twitch Background Sync Interval Dropdown (min 15 min) */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="settings-twitch-poll-interval" className="block text-sm font-semibold">
                      {t('settings.twitchPollIntervalLabel')}
                    </label>
                    <p className="text-xs text-muted">{t('settings.twitchPollIntervalHint')}</p>
                  </div>
                  <select
                    id="settings-twitch-poll-interval"
                    value={serverSettings.twitchPollIntervalMinutes}
                    disabled={savingServer}
                    onChange={(e) =>
                      void patchServerSettings({
                        twitchPollIntervalMinutes: Number(e.target.value) as TwitchPollIntervalMinutes,
                      })
                    }
                    className="w-48 shrink-0 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-fg focus:border-accent focus:outline-none"
                  >
                    {TWITCH_POLL_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {t('settings.pollMinutes', { minutes })}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Auto-Cleanup for old unread items */}
                <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Archive className="h-4 w-4 text-accent" />
                        <span>{t('settings.autoArchiveLabel')}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{t('settings.autoArchiveHint')}</p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={serverSettings.autoArchiveEnabled}
                      disabled={savingServer}
                      onClick={() =>
                        void patchServerSettings({
                          autoArchiveEnabled: !serverSettings.autoArchiveEnabled,
                        })
                      }
                      className="flex shrink-0 cursor-pointer select-none items-center rounded-full"
                    >
                      <span
                        className={cn(
                          'inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
                          serverSettings.autoArchiveEnabled ? 'bg-accent' : 'bg-line',
                        )}
                      >
                        <span
                          className={cn(
                            'h-5 w-5 rounded-full bg-canvas shadow-xs transition-transform',
                            serverSettings.autoArchiveEnabled ? 'translate-x-5' : 'translate-x-0',
                          )}
                        />
                      </span>
                    </button>
                  </div>

                  <div
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3 transition-opacity',
                      !serverSettings.autoArchiveEnabled && 'opacity-50',
                    )}
                  >
                    <label htmlFor="settings-auto-archive-days" className="text-xs font-medium text-fg">
                      {t('settings.autoArchiveToggle')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="settings-auto-archive-days"
                        type="number"
                        min={1}
                        max={365}
                        step={1}
                        value={serverSettings.autoArchiveDays}
                        onChange={(e) => {
                          const days = Math.min(Math.max(Math.round(Number(e.target.value) || 1), 1), 365);
                          setServerSettings((prev) => ({ ...prev, autoArchiveDays: days }));
                        }}
                        onBlur={() =>
                          void patchServerSettings({
                            autoArchiveDays: serverSettings.autoArchiveDays,
                          })
                        }
                        className="w-20 rounded-lg border border-line bg-surface px-3 py-1.5 text-right text-sm font-semibold tabular-nums focus:border-accent focus:outline-none"
                      />
                      <span className="text-xs font-medium text-muted">{t('settings.autoArchiveDaysUnit')}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {AUTO_ARCHIVE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={savingServer}
                        onClick={() => void patchServerSettings({ autoArchiveDays: preset })}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors',
                          serverSettings.autoArchiveDays === preset
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-line bg-surface text-muted hover:border-muted/60 hover:text-fg',
                        )}
                      >
                        {preset}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: BACKUPS & OPML */}
            {activeTab === 'backup' && (
              <div className="space-y-4">
                {/* Full Database Backup & Restore */}
                <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-4.5 w-4.5 text-accent" />
                    <h3 className="text-sm font-semibold">{t('settings.backupTitle')}</h3>
                  </div>
                  <p className="text-xs text-muted">{t('settings.backupHint')}</p>

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleExportFullBackup()}
                      className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-canvas transition-colors hover:bg-accent-strong disabled:opacity-50"
                    >
                      {backupBusy === 'export' ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      <span>{t('settings.exportBackup')}</span>
                    </button>

                    <input
                      ref={backupFileRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => void handleRestoreFullBackup(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => backupFileRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {backupBusy === 'restore' ? (
                        <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span>
                        {backupBusy === 'restore' ? t('settings.restoringBackup') : t('settings.restoreBackup')}
                      </span>
                    </button>
                  </div>
                </div>

                {/* OPML Import & Export for YouTube and RSS */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">{t('settings.opmlTitle')}</h3>
                    <p className="text-xs text-muted">{t('settings.opmlHint')}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* YouTube OPML Card */}
                    <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-canvas/60 p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-youtube/15 text-youtube">
                          <YouTubeIcon className="h-4.5 w-4.5" />
                        </span>
                        <span className="text-sm font-semibold">{t('settings.youtubeOpml')}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={ytFileRef}
                          type="file"
                          accept=".opml,.xml,text/xml,application/xml"
                          className="hidden"
                          onChange={(e) => void handleOpmlSelect('youtube', e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => ytFileRef.current?.click()}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {importingType === 'youtube' ? (
                            <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <span>
                            {importingType === 'youtube' ? t('settings.importing') : t('settings.importOpml')}
                          </span>
                        </button>
                        <a
                          href={api.exportOpmlUrl('youtube')}
                          download
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-canvas transition-colors hover:bg-accent-strong"
                        >
                          <Download className="h-4 w-4" />
                          <span>{t('settings.exportOpml')}</span>
                        </a>
                      </div>
                    </div>

                    {/* RSS OPML Card */}
                    <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-canvas/60 p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
                          <Rss className="h-4.5 w-4.5" />
                        </span>
                        <span className="text-sm font-semibold">{t('settings.rssOpml')}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={rssFileRef}
                          type="file"
                          accept=".opml,.xml,text/xml,application/xml"
                          className="hidden"
                          onChange={(e) => void handleOpmlSelect('rss', e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => rssFileRef.current?.click()}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {importingType === 'rss' ? (
                            <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <span>{importingType === 'rss' ? t('settings.importing') : t('settings.importOpml')}</span>
                        </button>
                        <a
                          href={api.exportOpmlUrl('rss')}
                          download
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-canvas transition-colors hover:bg-accent-strong"
                        >
                          <Download className="h-4 w-4" />
                          <span>{t('settings.exportOpml')}</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Twitch Channels Import & Export */}
                <div className="space-y-3 rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <TwitchIcon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{t('settings.twitchBackupTitle')}</h3>
                      <p className="text-xs text-muted">{t('settings.twitchBackupHint')}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <input
                      ref={twitchFileRef}
                      type="file"
                      accept=".json,.txt,application/json,text/plain"
                      className="hidden"
                      onChange={(e) => void handleTwitchImport(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => twitchFileRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {importingType === 'twitch' ? (
                        <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span>{importingType === 'twitch' ? t('settings.importing') : t('settings.importTwitch')}</span>
                    </button>
                    <a
                      href={api.exportTwitchChannelsUrl()}
                      download
                      className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-canvas transition-colors hover:bg-accent-strong"
                    >
                      <Download className="h-4 w-4" />
                      <span>{t('settings.exportTwitch')}</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
            {/* TAB 6: INFO & UPDATES */}
            {activeTab === 'info' && <InfoTab versionInfo={versionInfo} onVersionChange={onVersionChange} />}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-canvas/40 px-6 py-3.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('settings.resetDefaults')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
