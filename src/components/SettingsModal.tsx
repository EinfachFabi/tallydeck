import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  LoaderCircle,
  Moon,
  Palette,
  RotateCcw,
  Rss,
  SlidersHorizontal,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import type { FeedType } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n/I18nContext';
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_COMPLETED_DAYS,
  DEFAULT_INBOX_LIMIT,
  DEFAULT_THEME,
  MAX_COMPLETED_DAYS,
  MAX_INBOX_LIMIT,
  MIN_COMPLETED_DAYS,
  MIN_INBOX_LIMIT,
  THEMES,
  useSettings,
} from '../context/SettingsContext';
import { cn, errorText } from '../utils/format';
import { YouTubeIcon } from './YouTubeIcon';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const INBOX_PRESETS = [25, 50, 100, 200, 500] as const;
const DAYS_PRESETS = [1, 3, 7, 14, 30] as const;

export function SettingsModal({ open, onClose, onImported }: SettingsModalProps) {
  const { t } = useI18n();
  const { colorMode, setColorMode, theme, setTheme, inboxLimit, setInboxLimit, completedDays, setCompletedDays } =
    useSettings();

  const [importingType, setImportingType] = useState<FeedType | null>(null);
  const [opmlMessage, setOpmlMessage] = useState<{ type: FeedType; text: string; isError?: boolean } | null>(null);

  const ytFileRef = useRef<HTMLInputElement | null>(null);
  const rssFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setOpmlMessage(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !importingType) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, importingType, onClose]);

  if (!open) return null;

  async function handleFileSelect(feedType: FeedType, file: File | undefined) {
    if (!file || importingType) return;
    setImportingType(feedType);
    setOpmlMessage(null);
    try {
      const text = await file.text();
      const result = await api.importOpml(feedType, text);
      setOpmlMessage({
        type: feedType,
        text: t('settings.importResult', {
          imported: result.imported,
          skipped: result.skipped,
          failed: result.failed,
        }),
      });
      onImported();
    } catch (err) {
      setOpmlMessage({
        type: feedType,
        text: errorText(err, t),
        isError: true,
      });
    } finally {
      setImportingType(null);
      if (ytFileRef.current) ytFileRef.current.value = '';
      if (rssFileRef.current) rssFileRef.current.value = '';
    }
  }

  function resetToDefaults() {
    setColorMode(DEFAULT_COLOR_MODE);
    setTheme(DEFAULT_THEME);
    setInboxLimit(DEFAULT_INBOX_LIMIT);
    setCompletedDays(DEFAULT_COMPLETED_DAYS);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
      onClick={() => !importingType && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="flex max-h-[90vh] w-full max-w-2xl animate-fade-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 id="settings-modal-title" className="text-lg font-semibold">
              {t('settings.title')}
            </h2>
            <p className="text-xs text-muted">{t('settings.subtitle')}</p>
          </div>
          <button
            type="button"
            disabled={Boolean(importingType)}
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg"
            aria-label={t('settings.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* 1. Appearance: Dark/Light switch + 5 Themes */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <Palette className="h-4 w-4 text-accent" />
              <span>{t('settings.appearanceTitle')}</span>
            </div>

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
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: swatch.accent }} />
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: swatch.success }} />
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: swatch.danger }} />
                      </span>
                      <span className="truncate">{t(item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 2. Display & History Limits */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <SlidersHorizontal className="h-4 w-4 text-accent" />
              <span>{t('settings.displayTitle')}</span>
            </div>

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
          </section>

          {/* 3. OPML Import & Export / Backup for YouTube and RSS */}
          <section className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <Download className="h-4 w-4 text-accent" />
                <span>{t('settings.opmlTitle')}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{t('settings.opmlHint')}</p>
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
                    onChange={(e) => void handleFileSelect('youtube', e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    disabled={Boolean(importingType)}
                    onClick={() => ytFileRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {importingType === 'youtube' ? (
                      <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span>{importingType === 'youtube' ? t('settings.importing') : t('settings.importOpml')}</span>
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
                    onChange={(e) => void handleFileSelect('rss', e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    disabled={Boolean(importingType)}
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

            {opmlMessage && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium',
                  opmlMessage.isError ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success',
                )}
              >
                {opmlMessage.isError ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1">{opmlMessage.text}</span>
                <button
                  type="button"
                  onClick={() => setOpmlMessage(null)}
                  className="rounded p-0.5 opacity-75 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-canvas/40 px-6 py-3.5">
          <button
            type="button"
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('settings.resetDefaults')}</span>
          </button>
          <button
            type="button"
            disabled={Boolean(importingType)}
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-strong"
          >
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
